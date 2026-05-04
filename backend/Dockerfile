# --- builder ---
FROM node:20-slim AS builder
WORKDIR /app
COPY package.json tsconfig.json ./
RUN npm install
COPY src ./src
RUN npm run build

# --- runtime (HTTP API only; Puppeteer runs in the dedicated worker image) ---
FROM node:20-slim
ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=true

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates dumb-init \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist

# Run as non-root.
RUN groupadd -r app && useradd -r -g app -m -d /home/app app \
 && chown -R app:app /app /home/app
ENV HOME=/home/app XDG_CONFIG_HOME=/home/app/.config XDG_CACHE_HOME=/home/app/.cache
USER app

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server.js"]
