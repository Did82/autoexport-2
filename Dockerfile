# Используем официальный образ Bun
FROM oven/bun:debian

# Устанавливаем rsync (требуется для копирования файлов)
RUN apt-get update && \
    apt-get install -y rsync && \
    rm -rf /var/lib/apt/lists/*

# Устанавливаем рабочую директорию
WORKDIR /app

# Копируем файлы зависимостей
COPY package.json bun.lock* ./

# Устанавливаем зависимости
RUN bun install --frozen-lockfile

# Копируем весь проект
COPY . .

# Создаем пользователя для безопасности (не root)
# Если UID 1000 занят, создаем appuser с UID 1001
RUN if id -u 1000 >/dev/null 2>&1; then \
        useradd -m -u 1001 appuser; \
        chown -R appuser:appuser /app; \
    else \
        useradd -m -u 1000 appuser; \
        chown -R appuser:appuser /app; \
    fi

# Переключаемся на непривилегированного пользователя
USER appuser

# Открываем порт
EXPOSE 3001

# Переменные окружения по умолчанию
ENV NODE_ENV=production
ENV PORT=3001

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD bun -e "fetch('http://localhost:3001/api/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Запускаем приложение
CMD ["bun", "run", "start"]

