# API image (TASK-001). Build from the repository root: docker build -f api/Dockerfile .
# Runs as the unprivileged "node" user; applies database migrations, then starts the API.

FROM node:24.22.2-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY api/package.json api/
COPY web/package.json web/
# Runtime dependencies only (Prisma's CLI is one: it applies migrations on start).
RUN npm ci --workspace api --omit=dev && npm cache clean --force

FROM node:24.22.2-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY api/package.json api/
COPY web/package.json web/
RUN npm ci --workspace api
COPY api/ api/
WORKDIR /app/api
# prisma.config.ts requires DATABASE_URL; generating the client never connects, so a placeholder is enough.
RUN DATABASE_URL=postgresql://build:unused@localhost:5432/unused node ../node_modules/prisma/build/index.js generate \
  && npm run build

FROM node:24.22.2-alpine
ENV NODE_ENV=production
# Inside the container the API must accept connections from the web container (not only loopback).
ENV API_HOST=0.0.0.0
WORKDIR /app
COPY --from=deps /app/node_modules node_modules
COPY --from=deps /app/package.json ./
COPY --from=build /app/api/package.json /app/api/prisma.config.ts api/
COPY --from=build /app/api/prisma api/prisma
COPY --from=build /app/api/dist api/dist
WORKDIR /app/api
USER node
EXPOSE 3000
CMD ["sh", "-c", "node ../node_modules/prisma/build/index.js migrate deploy && exec node dist/main.js"]
