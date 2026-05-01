FROM node:25-slim AS deps
WORKDIR /app
COPY package.json ./
RUN npm install

FROM node:25-slim AS builder
WORKDIR /app
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:25-slim
WORKDIR /app
ENV NODE_ENV=production

# Copy built artefacts with node:node ownership so the unprivileged user below
# can read them. The node:*-slim base image ships a `node` user (UID 1000) for
# exactly this use.
COPY --from=builder --chown=node:node /app/.next ./.next
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/node_modules ./node_modules

USER node
EXPOSE 3000
CMD ["npm", "start"]
