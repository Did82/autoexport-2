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

