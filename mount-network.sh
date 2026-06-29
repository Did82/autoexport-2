#!/bin/bash

#===============================================================================
#                         НАСТРОЙКИ - ИЗМЕНИТЕ ПОД СЕБЯ
#===============================================================================

# === NFS настройки ===
NFS_ENABLED=false                              # true/false - включить NFS
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
SMB_USERNAME="${SMB_USERNAME:-user}"          # Имя пользователя
SMB_PASSWORD="${SMB_PASSWORD:-}"              # Передайте через окружение
SMB_DOMAIN="WORKGROUP"                        # Домен/рабочая группа
SMB_VERSION="3.0"                             # Версия протокола (2.0, 2.1, 3.0)
#SMB_OPTIONS="_netdev,x-systemd.automount,x-systemd.idle-timeout=300,nofail"
SMB_OPTIONS="_netdev,x-systemd.automount,nofail"

# === SSHFS настройки ===
SSHFS_ENABLED=true                            # true/false - включить SSHFS
SSHFS_USER="root"                             # Пользователь SSH
SSHFS_SERVER="192.168.188.12"                 # IP сервера
SSHFS_SHARE="/ftp/server/export1"             # Путь на сервере
SSHFS_MOUNT="/mnt/sshfs-share"                # Локальная точка монтирования
SSHFS_PORT="22"                               # SSH порт
#SSHFS_OPTIONS="_netdev,x-systemd.automount,x-systemd.idle-timeout=300,nofail,allow_other,reconnect,ServerAliveInterval=15,ServerAliveCountMax=3"
SSHFS_OPTIONS="_netdev,noauto,x-systemd.automount,allow_other,reconnect"
SSHFS_CREATE_KEY=true                         # Создать SSH-ключ если нет

# === Общие настройки ===
LOCAL_USER=$(logname 2>/dev/null || echo $SUDO_USER)  # Текущий пользователь
LOCAL_UID=$(id -u "$LOCAL_USER")                      # UID пользователя
LOCAL_GID=$(id -g "$LOCAL_USER")                      # GID пользователя
LOCAL_HOME=$(eval echo ~"$LOCAL_USER")                # Home директория
CREDENTIALS_FILE="/etc/samba/.credentials"            # Файл с учётными данными SMB
BACKUP_FSTAB=true                                     # Бэкапить /etc/fstab

#===============================================================================
#                         КОД СКРИПТА - НЕ ИЗМЕНЯТЬ
#===============================================================================

set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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
            SSHFS_PKG="sshfs"
            ;;
        fedora|rhel|centos|rocky|almalinux)
            PKG_MANAGER="dnf"
            PKG_INSTALL="dnf install -y"
            NFS_PKG="nfs-utils"
            SMB_PKG="cifs-utils"
            SSHFS_PKG="fuse-sshfs"
            ;;
        arch|cachyos|endeavouros|manjaro)
            PKG_MANAGER="pacman"
            PKG_INSTALL="pacman -S --noconfirm"
            NFS_PKG="nfs-utils"
            SMB_PKG="cifs-utils"
            SSHFS_PKG="sshfs"
            ;;
        *)
            log_warn "Неизвестный дистрибутив: $DISTRO"
            if [[ $DISTRO_LIKE == *"debian"* ]] || [[ $DISTRO_LIKE == *"ubuntu"* ]]; then
                PKG_MANAGER="apt"
                PKG_INSTALL="apt install -y"
                NFS_PKG="nfs-common"
                SMB_PKG="cifs-utils"
                SSHFS_PKG="sshfs"
            elif [[ $DISTRO_LIKE == *"fedora"* ]] || [[ $DISTRO_LIKE == *"rhel"* ]]; then
                PKG_MANAGER="dnf"
                PKG_INSTALL="dnf install -y"
                NFS_PKG="nfs-utils"
                SMB_PKG="cifs-utils"
                SSHFS_PKG="fuse-sshfs"
            elif [[ $DISTRO_LIKE == *"arch"* ]]; then
                PKG_MANAGER="pacman"
                PKG_INSTALL="pacman -S --noconfirm"
                NFS_PKG="nfs-utils"
                SMB_PKG="cifs-utils"
                SSHFS_PKG="sshfs"
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
    
    if [[ $SSHFS_ENABLED == true ]]; then
        packages="$packages $SSHFS_PKG"
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

# Проверка записи в fstab
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
    
    if [[ ! -d $NFS_MOUNT ]]; then
        mkdir -p "$NFS_MOUNT"
        log_success "Создана директория: $NFS_MOUNT"
    fi
    
    log_info "Проверка доступности NFS-сервера $NFS_SERVER..."
    if ping -c 1 -W 3 "$NFS_SERVER" &>/dev/null; then
        log_success "Сервер доступен"
    else
        log_warn "Сервер недоступен, но продолжаем настройку..."
    fi
    
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
    
    log_info "Попытка монтирования NFS..."
    if mount "$NFS_MOUNT" 2>/dev/null; then
        log_success "NFS успешно смонтирован в $NFS_MOUNT"
        df -h "$NFS_MOUNT"
    else
        log_warn "Не удалось смонтировать. Проверьте настройки сервера."
    fi
}

# Настройка SMB
setup_smb() {
    if [[ $SMB_ENABLED != true ]]; then
        log_info "SMB отключён, пропуск..."
        return
    fi

    if [[ -z $SMB_PASSWORD ]]; then
        log_error "Для SMB задайте переменную окружения SMB_PASSWORD"
        return 1
    fi
    
    log_info "=== Настройка SMB/CIFS ==="
    
    local creds_dir=$(dirname "$CREDENTIALS_FILE")
    if [[ ! -d $creds_dir ]]; then
        mkdir -p "$creds_dir"
    fi
    
    log_info "Создание файла учётных данных..."
    cat > "$CREDENTIALS_FILE" << EOF
username=${SMB_USERNAME}
password=${SMB_PASSWORD}
domain=${SMB_DOMAIN}
EOF
    chmod 600 "$CREDENTIALS_FILE"
    log_success "Создан защищённый файл: $CREDENTIALS_FILE"
    
    if [[ ! -d $SMB_MOUNT ]]; then
        mkdir -p "$SMB_MOUNT"
        log_success "Создана директория: $SMB_MOUNT"
    fi
    
    log_info "Проверка доступности SMB-сервера $SMB_SERVER..."
    if ping -c 1 -W 3 "$SMB_SERVER" &>/dev/null; then
        log_success "Сервер доступен"
    else
        log_warn "Сервер недоступен, но продолжаем настройку..."
    fi
    
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
    
    log_info "Попытка монтирования SMB..."
    if mount "$SMB_MOUNT" 2>/dev/null; then
        log_success "SMB успешно смонтирован в $SMB_MOUNT"
        df -h "$SMB_MOUNT"
    else
        log_warn "Не удалось смонтировать. Проверьте настройки."
    fi
}

# Настройка SSHFS
setup_sshfs() {
    if [[ $SSHFS_ENABLED != true ]]; then
        log_info "SSHFS отключён, пропуск..."
        return
    fi
    
    log_info "=== Настройка SSHFS ==="
    
    local ssh_key="$LOCAL_HOME/.ssh/id_ed25519"
    
    # Создание SSH-ключа если нужно
    if [[ $SSHFS_CREATE_KEY == true ]] && [[ ! -f "$ssh_key" ]]; then
        log_info "Создание SSH-ключа..."
        sudo -u "$LOCAL_USER" ssh-keygen -t ed25519 -N "" -f "$ssh_key"
        log_success "SSH-ключ создан: $ssh_key"
        
        echo ""
        log_warn "=========================================="
        log_warn "ВАЖНО: Скопируйте ключ на сервер вручную!"
        log_warn "=========================================="
        echo ""
        echo "Выполните команду:"
        echo -e "${GREEN}ssh-copy-id -p $SSHFS_PORT $SSHFS_USER@$SSHFS_SERVER${NC}"
        echo ""
        read -p "Нажмите Enter после копирования ключа..." 
    elif [[ ! -f "$ssh_key" ]]; then
        log_error "SSH-ключ не найден: $ssh_key"
        log_info "Создайте ключ: ssh-keygen -t ed25519"
        log_info "Скопируйте на сервер: ssh-copy-id -p $SSHFS_PORT $SSHFS_USER@$SSHFS_SERVER"
        return
    fi
    
    # Проверка подключения SSH
    log_info "Проверка SSH-подключения..."
    if sudo -u "$LOCAL_USER" ssh -p "$SSHFS_PORT" -o ConnectTimeout=5 -o BatchMode=yes "$SSHFS_USER@$SSHFS_SERVER" "echo OK" &>/dev/null; then
        log_success "SSH-подключение работает"
    else
        log_warn "SSH-подключение не удалось. Проверьте ключи."
        echo "Попробуйте: ssh-copy-id -p $SSHFS_PORT $SSHFS_USER@$SSHFS_SERVER"
        read -p "Продолжить настройку? (y/n): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            return
        fi
    fi
    
    # Настройка fuse.conf для allow_other
    if ! grep -q "^user_allow_other" /etc/fuse.conf 2>/dev/null; then
        log_info "Включение user_allow_other в /etc/fuse.conf..."
        echo "user_allow_other" >> /etc/fuse.conf
        log_success "Настроен /etc/fuse.conf"
    fi
    
    # Создание точки монтирования
    if [[ ! -d $SSHFS_MOUNT ]]; then
        mkdir -p "$SSHFS_MOUNT"
        chown "$LOCAL_USER:$LOCAL_USER" "$SSHFS_MOUNT"
        log_success "Создана директория: $SSHFS_MOUNT"
    fi
    
    # Формирование записи fstab
    local sshfs_full_options="Port=${SSHFS_PORT},IdentityFile=${ssh_key},uid=${LOCAL_UID},gid=${LOCAL_GID},${SSHFS_OPTIONS}"
    local fstab_entry="${SSHFS_USER}@${SSHFS_SERVER}:${SSHFS_SHARE}  ${SSHFS_MOUNT}  fuse.sshfs  ${sshfs_full_options}  0 0"
    
    if fstab_entry_exists "$SSHFS_MOUNT"; then
        log_warn "Запись для $SSHFS_MOUNT уже существует в /etc/fstab"
        read -p "Заменить? (y/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            sed -i "\|[[:space:]]${SSHFS_MOUNT}[[:space:]]|d" /etc/fstab
            echo "$fstab_entry" >> /etc/fstab
            log_success "Запись обновлена"
        fi
    else
        echo "" >> /etc/fstab
        echo "# SSHFS mount - added by setup script $(date +%Y-%m-%d)" >> /etc/fstab
        echo "$fstab_entry" >> /etc/fstab
        log_success "Добавлена запись в /etc/fstab"
    fi
    
    # Тестовое монтирование
    log_info "Попытка монтирования SSHFS..."
    if mount "$SSHFS_MOUNT" 2>/dev/null; then
        log_success "SSHFS успешно смонтирован в $SSHFS_MOUNT"
        df -h "$SSHFS_MOUNT"
    else
        log_warn "Не удалось смонтировать автоматически."
        log_info "Попробуйте вручную: sshfs ${SSHFS_USER}@${SSHFS_SERVER}:${SSHFS_SHARE} ${SSHFS_MOUNT}"
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
        echo "  Сервер:             $NFS_SERVER:$NFS_SHARE"
        echo "  Точка монтирования: $NFS_MOUNT"
        echo ""
    fi
    
    if [[ $SMB_ENABLED == true ]]; then
        echo -e "${BLUE}SMB:${NC}"
        echo "  Сервер:             //$SMB_SERVER/$SMB_SHARE"
        echo "  Точка монтирования: $SMB_MOUNT"
        echo "  Credentials:        $CREDENTIALS_FILE"
        echo ""
    fi
    
    if [[ $SSHFS_ENABLED == true ]]; then
        echo -e "${BLUE}SSHFS:${NC}"
        echo "  Сервер:             $SSHFS_USER@$SSHFS_SERVER:$SSHFS_SHARE"
        echo "  Точка монтирования: $SSHFS_MOUNT"
        echo "  SSH-ключ:           $LOCAL_HOME/.ssh/id_ed25519"
        echo ""
    fi
    
    echo -e "${YELLOW}Полезные команды:${NC}"
    echo "  sudo mount -a                    # Смонтировать все из fstab"
    echo "  mount | grep -E 'nfs|cifs|fuse'  # Проверить монтирование"
    echo "  cat /etc/fstab                   # Просмотреть fstab"
    echo ""
}

# Удаление настроек
uninstall() {
    log_warn "=== УДАЛЕНИЕ НАСТРОЕК ==="
    
    # Размонтирование
    for mount_point in "$NFS_MOUNT" "$SMB_MOUNT" "$SSHFS_MOUNT"; do
        if mountpoint -q "$mount_point" 2>/dev/null; then
            umount "$mount_point" || umount -l "$mount_point"
            log_info "Размонтирован $mount_point"
        fi
    done
    
    # Удаление записей из fstab
    for mount_point in "$NFS_MOUNT" "$SMB_MOUNT" "$SSHFS_MOUNT"; do
        if [[ -n $mount_point ]]; then
            sed -i "\|[[:space:]]${mount_point}[[:space:]]|d" /etc/fstab
        fi
    done
    
    sed -i "/# NFS mount - added by setup script/d" /etc/fstab
    sed -i "/# SMB\/CIFS mount - added by setup script/d" /etc/fstab
    sed -i "/# SSHFS mount - added by setup script/d" /etc/fstab
    
    # Удаление credentials
    if [[ -f $CREDENTIALS_FILE ]]; then
        rm -f "$CREDENTIALS_FILE"
        log_info "Удалён файл $CREDENTIALS_FILE"
    fi
    
    systemctl daemon-reload
    log_success "Настройки удалены"
}

# Справка
show_help() {
    echo "Использование: $0 [опции]"
    echo ""
    echo "Опции:"
    echo "  --uninstall, -u   Удалить настройки"
    echo "  --help, -h        Показать справку"
    echo ""
    echo "Настройте переменные в начале скрипта перед запуском."
    echo ""
    echo "Поддерживаемые протоколы:"
    echo "  NFS    - для Linux серверов (быстрый, надёжный)"
    echo "  SMB    - для NAS и Windows (универсальный)"
    echo "  SSHFS  - через SSH (безопасный, работает везде)"
}

# Главная функция
main() {
    echo ""
    echo "==============================================================================="
    echo "          АВТОНАСТРОЙКА СЕТЕВЫХ ПАПОК (NFS/SMB/SSHFS)"
    echo "==============================================================================="
    echo ""
    
    case "${1:-}" in
        --uninstall|-u)
            check_root
            uninstall
            exit 0
            ;;
        --help|-h)
            show_help
            exit 0
            ;;
    esac
    
    check_root
    detect_distro
    #update_packages
    #install_packages
    backup_fstab
    setup_nfs
    setup_smb
    setup_sshfs
    reload_systemd
    print_summary
}

main "$@"
