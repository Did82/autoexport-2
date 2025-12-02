# AutoExport

Система автоматизированного экспорта данных с веб-интерфейсом для мониторинга. Система автоматически копирует данные из исходной директории в целевую, управляет дисковым пространством и ведет логирование всех операций.

## Технологический стек

-   **Runtime:** Bun
-   **Backend Framework:** Bun Fullstack dev server
-   **Frontend Framework:** React 19
-   **Database:** SQLite (через Bun.sql)
-   **Cron:** Croner
-   **UI:** Radix UI, Tailwind CSS
-   **File Operations:** rsync (через Bun shell)

## Структура проекта

```
.
├── src/                    # Frontend (React)
│   ├── components/
│   │   ├── Dashboard.tsx
│   │   ├── DiskUsageCard.tsx
│   │   ├── Header.tsx
│   │   ├── SettingsDialog.tsx
│   │   ├── LogTable.tsx
│   │   ├── CopyLogsTab.tsx
│   │   ├── DeleteLogsTab.tsx
│   │   ├── ErrorLogsTab.tsx
│   │   └── ui/             # Radix UI компоненты
│   ├── styles/
│   │   ├── globals.css
│   │   └── components.css
│   ├── utils/
│   │   ├── api.ts
│   │   └── utils.ts
│   ├── App.tsx
│   └── main.tsx            # Точка входа React
├── public/
│   └── index.html
├── server/
│   ├── libs/
│   │   ├── db.ts           # SQLite база данных
│   │   ├── config.ts       # Конфигурация
│   │   └── copy.ts          # Копирование через rsync
│   ├── services/
│   │   ├── copy.service.ts
│   │   ├── delete.service.ts
│   │   ├── cleanup.service.ts
│   │   └── config.service.ts
│   ├── utils/
│   │   ├── utils.ts
│   │   ├── securityUtils.ts
│   │   └── delete.ts
│   ├── index.ts            # Точка входа сервера + API
│   └── copy_all.ts         # CLI утилита
├── config.json             # Конфигурация (создается автоматически)
└── package.json
```

## Установка

```bash
bun install
```

## Запуск

### Docker Compose (рекомендуется для production)

1. Настройте пути в `docker-compose.yml` (volumes для `/mnt/ftp` и `/mnt/smb`)
2. Запустите:

```bash
docker-compose up -d
```

Остановка:

```bash
docker-compose down
```

Просмотр логов:

```bash
docker-compose logs -f
```

Пересборка после изменений:

```bash
docker-compose up -d --build
```

### Режим разработки

```bash
bun dev
```

Сервер запустится на `http://localhost:3001` с поддержкой HMR (Hot Module Reloading).

### Production (локально)

```bash
bun start
```

### CLI утилита для копирования всех директорий

```bash
bun copy-all
```

Или в Docker:

```bash
docker-compose exec autoexport bun copy-all
```

## Конфигурация

Конфигурация хранится в `config.json` (создается автоматически при первом запуске):

```json
{
    "src": "/mnt/ftp",
    "dest": "/mnt/smb",
    "limit": 78,
    "cleanupDays": 90
}
```

Можно настроить через переменные окружения:

-   `SRC_PATH` - исходная директория
-   `DEST_PATH` - целевая директория
-   `DISK_LIMIT` - лимит диска (%)
-   `CLEANUP_DAYS` - дней хранения логов

## API Endpoints

-   `GET /api/config` - получить конфигурацию
-   `POST /api/config` - обновить конфигурацию
-   `GET /api/space` - использование дискового пространства
-   `GET /api/copy` - логи копирования
-   `GET /api/delete` - логи удаления
-   `GET /api/errors` - логи ошибок
-   `GET /api/dirs?path=...` - список директорий (только `/mnt/*`)

## Cron задачи

1. **Каждый час** - копирование текущего дня
2. **22:00 каждый день** - копирование вчерашнего дня
3. **03:00 каждый день (Europe/Moscow)** - контроль диска источника
4. **04:00 каждый день** - контроль диска назначения
5. **05:00 каждый день** - очистка старых логов
6. **06:00 каждый день** - удаление избыточных директорий

## Веб-интерфейс

После запуска сервера откройте `http://localhost:3001` в браузере.

Интерфейс включает:

-   Мониторинг использования дискового пространства
-   Просмотр логов копирования, удаления и ошибок
-   Настройки системы (пути, лимиты, очистка)

## Формат директорий

Директории должны быть в формате `YYYYMMDD` (8 цифр), например: `20241231`

## Требования

-   Bun >= 1.3.2
-   rsync (должен быть установлен в системе)
-   Доступ к директориям `/mnt/*` (или настройте свои пути)

## Docker

Проект включает Docker и docker-compose для удобного деплоймента.

### Настройка

1. Отредактируйте `docker-compose.yml`:

    - Измените пути в `volumes` на ваши реальные директории
    - При необходимости настройте переменные окружения

2. Убедитесь, что директории существуют и доступны:
    ```bash
    ls -la /mnt/ftp /mnt/smb
    ```

### Запуск

```bash
# Сборка и запуск
docker-compose up -d

# Просмотр логов
docker-compose logs -f

# Остановка
docker-compose down

# Пересборка после изменений
docker-compose up -d --build
```

### Важно

-   Файлы `config.json` и `autoexport.db` монтируются как volumes, чтобы сохраняться между перезапусками
-   Убедитесь, что контейнер имеет права на чтение/запись в монтируемые директории
-   Healthcheck проверяет доступность сервиса каждые 30 секунд

# Скрипт автонастройки NFS и SMB

## Как использовать

### 1. Сохранить и отредактировать (необязательно, файл уже есть в проекте в mount-network.sh)

```bash
nano mount-network.sh
```

Измените переменные в начале скрипта под свои нужды.

### 2. Сделать исполняемым и запустить

```bash
chmod +x mount-network.sh
sudo ./mount-network.sh
```

### 3. Удалить настройки (если нужно)

```bash
sudo ./mount-network.sh --uninstall
```

---

## Примеры конфигураций

### Только NFS (для RHEL-сервера):

```bash
NFS_ENABLED=true
NFS_SERVER="192.168.1.100"
NFS_SHARE="/srv/data"
NFS_MOUNT="/mnt/server-data"

SMB_ENABLED=false
```

### Только SMB (для NAS):

```bash
NFS_ENABLED=false

SMB_ENABLED=true
SMB_SERVER="192.168.1.50"
SMB_SHARE="media"
SMB_MOUNT="/mnt/nas-media"
SMB_USERNAME="admin"
SMB_PASSWORD="nas_password"
```

### Только SSHFS (для сервера):

```bash
SSHFS_ENABLED=true
SSHFS_USER="user"
SSHFS_SERVER="192.168.188.12"
SSHFS_SHARE="/ftp/server/export1"
SSHFS_MOUNT="/mnt/sshfs-share"
```

### Несколько шар

Запустите скрипт несколько раз с разными настройками, или добавьте массивы:

```bash
# Для нескольких NFS-шар, добавьте в конец скрипта:
NFS_SHARES=(
    "192.168.1.100:/srv/data:/mnt/data"
    "192.168.1.100:/srv/backup:/mnt/backup"
)

for share in "${NFS_SHARES[@]}"; do
    IFS=':' read -r server path mount <<< "$share"
    NFS_SERVER="$server"
    NFS_SHARE="$path"
    NFS_MOUNT="$mount"
    setup_nfs
done
```

---
