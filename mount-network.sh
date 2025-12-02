#!/bin/bash

#===============================================================================
#                         НАСТРОЙКИ - ИЗМЕНИТЕ ПОД СЕБЯ
#===============================================================================

# === NFS настройки ===
NFS_ENABLED=true                              # true/false - включить NFS
NFS_SERVER="192.168.188.12"                    # IP NFS-сервера (RHEL)
NFS_SHARE="/ftp/server/export1"                    # Путь на сервере
NFS_MOUNT="/mnt/nfs"                    # Локальная точка монтирования
#NFS_OPTIONS="defaults,_netdev,x-systemd.automount,x-systemd.idle-timeout=300,nofail"
NFS_OPTIONS="defaults,_netdev,x-systemd.automount,nofail"

# === SMB настройки ===
SMB_ENABLED=true                              # true/false - включить SMB
SMB_SERVER="192.168.188.103"                     # IP NAS/SMB-сервера
SMB_SHARE="sounds"                            # Имя шары (без //)
SMB_MOUNT="/mnt/smb"                    # Локальная точка монтирования
SMB_USERNAME="user"                           # Имя пользователя
SMB_PASSWORD="password123"                    # Пароль
SMB_DOMAIN="WORKGROUP"                        # Домен/рабочая группа
SMB_VERSION="3.0"                             # Версия протокола (2.0, 2.1, 3.0)
#SMB_OPTIONS="_netdev,x-systemd.automount,x-systemd.idle-timeout=300,nofail"
SMB_OPTIONS="_netdev,x-systemd.automount,nofail"

# === Общие настройки ===
LOCAL_UID=$(id -u)                            # UID текущего пользователя
LOCAL_GID=$(id -g)                            # GID текущего пользователя
CREDENTIALS_FILE="/etc/samba/.credentials"   # Файл с учётными данными SMB
BACKUP_FSTAB=true                             # Бэкапить /etc/fstab

#===============================================================================
#                         КОД СКРИПТА - НЕ ИЗМЕНЯТЬ
#===============================================================================

set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1"; }

# Проверка root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "Скрипт должен запускаться от root (sudo)"
        exit 1
    fi
}

# Определение дистрибутива
detect_distro() {
    if [[ -f /etc/os-release ]]; then
        . /etc/os-release
        DISTRO=$ID
        DISTRO_LIKE=$ID_LIKE
    else
        log_error "Не удалось определить дистрибутив"
        exit 1
    fi
    
    case $DISTRO in
        ubuntu|debian|linuxmint|pop)
            PKG_MANAGER="apt"
            PKG_INSTALL="apt install -y"
            NFS_PKG="nfs-common"
            SMB_PKG="cifs-utils"
            ;;
        fedora|rhel|centos|rocky|almalinux)
            PKG_MANAGER="dnf"
            PKG_INSTALL="dnf install -y"
            NFS_PKG="nfs-utils"
            SMB_PKG="cifs-utils"
            ;;
        arch|cachyos|endeavouros|manjaro)
            PKG_MANAGER="pacman"
            PKG_INSTALL="pacman -S --noconfirm"
            NFS_PKG="nfs-utils"
            SMB_PKG="cifs-utils"
            ;;
        *)
            log_warn "Неизвестный дистрибутив: $DISTRO. Попытка определить по ID_LIKE..."
            if [[ $DISTRO_LIKE == *"debian"* ]] || [[ $DISTRO_LIKE == *"ubuntu"* ]]; then
                PKG_MANAGER="apt"
                PKG_INSTALL="apt install -y"
                NFS_PKG="nfs-common"
                SMB_PKG="cifs-utils"
            elif [[ $DISTRO_LIKE == *"fedora"* ]] || [[ $DISTRO_LIKE == *"rhel"* ]]; then
                PKG_MANAGER="dnf"
                PKG_INSTALL="dnf install -y"
                NFS_PKG="nfs-utils"
                SMB_PKG="cifs-utils"
            elif [[ $DISTRO_LIKE == *"arch"* ]]; then
                PKG_MANAGER="pacman"
                PKG_INSTALL="pacman -S --noconfirm"
                NFS_PKG="nfs-utils"
                SMB_PKG="cifs-utils"
            else
                log_error "Не удалось определить пакетный менеджер"
                exit 1
            fi
            ;;
    esac
    
    log_info "Обнаружен дистрибутив: $DISTRO (пакетный менеджер: $PKG_MANAGER)"
}

# Обновление списка пакетов
update_packages() {
    log_info "Обновление списка пакетов..."
    case $PKG_MANAGER in
        apt)    apt update ;;
        dnf)    dnf check-update || true ;;
        pacman) pacman -Sy ;;
    esac
}

# Установка пакетов
install_packages() {
    local packages=""
    
    if [[ $NFS_ENABLED == true ]]; then
        packages="$packages $NFS_PKG"
    fi
    
    if [[ $SMB_ENABLED == true ]]; then
        packages="$packages $SMB_PKG"
    fi
    
    if [[ -n $packages ]]; then
        log_info "Установка пакетов:$packages"
        $PKG_INSTALL $packages
        log_success "Пакеты установлены"
    fi
}

# Бэкап fstab
backup_fstab() {
    if [[ $BACKUP_FSTAB == true ]]; then
        local backup_file="/etc/fstab.backup.$(date +%Y%m%d_%H%M%S)"
        cp /etc/fstab "$backup_file"
        log_success "Создан бэкап: $backup_file"
    fi
}

# Проверка, есть ли уже запись в fstab
fstab_entry_exists() {
    local mount_point="$1"
    grep -q "^[^#].*[[:space:]]${mount_point}[[:space:]]" /etc/fstab
}

# Настройка NFS
setup_nfs() {
    if [[ $NFS_ENABLED != true ]]; then
        log_info "NFS отключён, пропуск..."
        return
    fi
    
    log_info "=== Настройка NFS ==="
    
    # Создание точки монтирования
    if [[ ! -d $NFS_MOUNT ]]; then
        mkdir -p "$NFS_MOUNT"
        log_success "Создана директория: $NFS_MOUNT"
    fi
    
    # Проверка доступности сервера
    log_info "Проверка доступности NFS-сервера $NFS_SERVER..."
    if ping -c 1 -W 3 "$NFS_SERVER" &>/dev/null; then
        log_success "Сервер доступен"
    else
        log_warn "Сервер недоступен, но продолжаем настройку..."
    fi
    
    # Добавление в fstab
    local fstab_entry="${NFS_SERVER}:${NFS_SHARE}  ${NFS_MOUNT}  nfs  ${NFS_OPTIONS}  0 0"
    
    if fstab_entry_exists "$NFS_MOUNT"; then
        log_warn "Запись для $NFS_MOUNT уже существует в /etc/fstab"
        read -p "Заменить? (y/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            sed -i "\|[[:space:]]${NFS_MOUNT}[[:space:]]|d" /etc/fstab
            echo "$fstab_entry" >> /etc/fstab
            log_success "Запись обновлена"
        fi
    else
        echo "" >> /etc/fstab
        echo "# NFS mount - added by setup script $(date +%Y-%m-%d)" >> /etc/fstab
        echo "$fstab_entry" >> /etc/fstab
        log_success "Добавлена запись в /etc/fstab"
    fi
    
    # Тестовое монтирование
    log_info "Попытка монтирования NFS..."
    if mount "$NFS_MOUNT" 2>/dev/null; then
        log_success "NFS успешно смонтирован в $NFS_MOUNT"
        df -h "$NFS_MOUNT"
    else
        log_warn "Не удалось смонтировать сейчас. Проверьте настройки сервера."
        log_info "Команда для ручной проверки: showmount -e $NFS_SERVER"
    fi
}

# Настройка SMB
setup_smb() {
    if [[ $SMB_ENABLED != true ]]; then
        log_info "SMB отключён, пропуск..."
        return
    fi
    
    log_info "=== Настройка SMB/CIFS ==="
    
    # Создание директории для credentials
    local creds_dir=$(dirname "$CREDENTIALS_FILE")
    if [[ ! -d $creds_dir ]]; then
        mkdir -p "$creds_dir"
    fi
    
    # Создание файла с учётными данными
    log_info "Создание файла учётных данных..."
    cat > "$CREDENTIALS_FILE" << EOF
username=${SMB_USERNAME}
password=${SMB_PASSWORD}
domain=${SMB_DOMAIN}
EOF
    chmod 600 "$CREDENTIALS_FILE"
    log_success "Создан защищённый файл: $CREDENTIALS_FILE"
    
    # Создание точки монтирования
    if [[ ! -d $SMB_MOUNT ]]; then
        mkdir -p "$SMB_MOUNT"
        log_success "Создана директория: $SMB_MOUNT"
    fi
    
    # Проверка доступности сервера
    log_info "Проверка доступности SMB-сервера $SMB_SERVER..."
    if ping -c 1 -W 3 "$SMB_SERVER" &>/dev/null; then
        log_success "Сервер доступен"
    else
        log_warn "Сервер недоступен, но продолжаем настройку..."
    fi
    
    # Формирование записи fstab
    local smb_full_options="credentials=${CREDENTIALS_FILE},vers=${SMB_VERSION},uid=${LOCAL_UID},gid=${LOCAL_GID},${SMB_OPTIONS}"
    local fstab_entry="//${SMB_SERVER}/${SMB_SHARE}  ${SMB_MOUNT}  cifs  ${smb_full_options}  0 0"
    
    if fstab_entry_exists "$SMB_MOUNT"; then
        log_warn "Запись для $SMB_MOUNT уже существует в /etc/fstab"
        read -p "Заменить? (y/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            sed -i "\|[[:space:]]${SMB_MOUNT}[[:space:]]|d" /etc/fstab
            echo "$fstab_entry" >> /etc/fstab
            log_success "Запись обновлена"
        fi
    else
        echo "" >> /etc/fstab
        echo "# SMB/CIFS mount - added by setup script $(date +%Y-%m-%d)" >> /etc/fstab
        echo "$fstab_entry" >> /etc/fstab
        log_success "Добавлена запись в /etc/fstab"
    fi
    
    # Тестовое монтирование
    log_info "Попытка монтирования SMB..."
    if mount "$SMB_MOUNT" 2>/dev/null; then
        log_success "SMB успешно смонтирован в $SMB_MOUNT"
        df -h "$SMB_MOUNT"
    else
        log_warn "Не удалось смонтировать сейчас. Проверьте настройки сервера."
        log_info "Команда для ручной проверки: smbclient -L //$SMB_SERVER -U $SMB_USERNAME"
    fi
}

# Перезагрузка systemd
reload_systemd() {
    log_info "Перезагрузка systemd daemon..."
    systemctl daemon-reload
    log_success "systemd перезагружен"
}

# Вывод итоговой информации
print_summary() {
    echo ""
    echo "==============================================================================="
    echo -e "${GREEN}                         НАСТРОЙКА ЗАВЕРШЕНА${NC}"
    echo "==============================================================================="
    echo ""
    
    if [[ $NFS_ENABLED == true ]]; then
        echo -e "${BLUE}NFS:${NC}"
        echo "  Сервер:        $NFS_SERVER:$NFS_SHARE"
        echo "  Точка монтирования: $NFS_MOUNT"
        echo ""
    fi
    
    if [[ $SMB_ENABLED == true ]]; then
        echo -e "${BLUE}SMB:${NC}"
        echo "  Сервер:        //$SMB_SERVER/$SMB_SHARE"
        echo "  Точка монтирования: $SMB_MOUNT"
        echo "  Credentials:   $CREDENTIALS_FILE"
        echo ""
    fi
    
    echo -e "${YELLOW}Полезные команды:${NC}"
    echo "  mount -a                    # Смонтировать все из fstab"
    echo "  mount | grep -E 'nfs|cifs'  # Проверить монтирование"
    echo "  cat /etc/fstab              # Просмотреть fstab"
    echo "  umount /mnt/xxx             # Размонтировать"
    echo ""
    
    if [[ $NFS_ENABLED == true ]]; then
        echo -e "${YELLOW}Диагностика NFS:${NC}"
        echo "  showmount -e $NFS_SERVER"
        echo "  sudo mount -t nfs $NFS_SERVER:$NFS_SHARE /mnt/test -v"
        echo ""
    fi
    
    if [[ $SMB_ENABLED == true ]]; then
        echo -e "${YELLOW}Диагностика SMB:${NC}"
        echo "  smbclient -L //$SMB_SERVER -U $SMB_USERNAME"
        echo "  sudo mount -t cifs //$SMB_SERVER/$SMB_SHARE /mnt/test -o username=$SMB_USERNAME -v"
        echo ""
    fi
}

# Удаление настроек (опционально)
uninstall() {
    log_warn "=== УДАЛЕНИЕ НАСТРОЕК ==="
    
    # Размонтирование
    if mountpoint -q "$NFS_MOUNT" 2>/dev/null; then
        umount "$NFS_MOUNT"
        log_info "Размонтирован $NFS_MOUNT"
    fi
    
    if mountpoint -q "$SMB_MOUNT" 2>/dev/null; then
        umount "$SMB_MOUNT"
        log_info "Размонтирован $SMB_MOUNT"
    fi
    
    # Удаление записей из fstab
    if [[ -n $NFS_MOUNT ]]; then
        sed -i "\|[[:space:]]${NFS_MOUNT}[[:space:]]|d" /etc/fstab
        sed -i "/# NFS mount - added by setup script/d" /etc/fstab
    fi
    
    if [[ -n $SMB_MOUNT ]]; then
        sed -i "\|[[:space:]]${SMB_MOUNT}[[:space:]]|d" /etc/fstab
        sed -i "/# SMB\/CIFS mount - added by setup script/d" /etc/fstab
    fi
    
    # Удаление credentials
    if [[ -f $CREDENTIALS_FILE ]]; then
        rm -f "$CREDENTIALS_FILE"
        log_info "Удалён файл $CREDENTIALS_FILE"
    fi
    
    systemctl daemon-reload
    log_success "Настройки удалены"
}

# Главная функция
main() {
    echo ""
    echo "==============================================================================="
    echo "          АВТОНАСТРОЙКА СЕТЕВЫХ ПАПОК (NFS/SMB)"
    echo "==============================================================================="
    echo ""
    
    # Обработка аргументов
    case "${1:-}" in
        --uninstall|-u)
            check_root
            uninstall
            exit 0
            ;;
        --help|-h)
            echo "Использование: $0 [опции]"
            echo ""
            echo "Опции:"
            echo "  --uninstall, -u   Удалить настройки"
            echo "  --help, -h        Показать справку"
            echo ""
            echo "Настройте переменные в начале скрипта перед запуском."
            exit 0
            ;;
    esac
    
    check_root
    detect_distro
    update_packages
    install_packages
    backup_fstab
    setup_nfs
    setup_smb
    reload_systemd
    print_summary
}

main "$@"