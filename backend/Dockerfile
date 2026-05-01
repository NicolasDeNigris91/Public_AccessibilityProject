# --- builder ---
FROM node:25-slim AS builder
WORKDIR /app
COPY package.json tsconfig.json ./
RUN npm install
COPY src ./src
RUN npm run build

# --- runtime (with Chromium for Puppeteer) ---
FROM node:25-slim
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium fonts-liberation libnss3 libatk-bridge2.0-0 libxkbcommon0 \
    libgbm1 libasound2 libpangocairo-1.0-0 libxshmfence1 ca-certificates dumb-init \
 && rm -rf /var/lib/apt/lists/* \
 && ln -sf /bin/true /usr/lib/chromium/chrome_crashpad_handler

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist

# Run as non-root
RUN groupadd -r app && useradd -r -g app -G audio,video -m -d /home/app app \
 && mkdir -p /tmp/chromium /tmp/chromium-crashes \
 && chown -R app:app /app /home/app /tmp/chromium /tmp/chromium-crashes
ENV HOME=/home/app XDG_CONFIG_HOME=/home/app/.config XDG_CACHE_HOME=/home/app/.cache
USER app

ENTRYPOINT ["dumb-init", "--"]
# ROLE=api -> http server, ROLE=worker -> queue consumer
CMD ["sh", "-c", "if [ \"$ROLE\" = \"worker\" ]; then node dist/workers/auditWorker.js; else node dist/server.js; fi"]
