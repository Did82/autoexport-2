FROM oven/bun:1.3.14-debian AS build

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1.3.14-debian AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends rsync \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build /app/dist ./dist

ENV NODE_ENV=production \
    PORT=3001 \
    APP_TIMEZONE=Europe/Minsk \
    CONFIG_PATH=/app/data/config.json \
    DATABASE_PATH=/app/data/autoexport.db

RUN mkdir -p /app/data

WORKDIR /app/dist

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD bun -e "fetch('http://localhost:3001/api/live').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["bun", "index.js"]
