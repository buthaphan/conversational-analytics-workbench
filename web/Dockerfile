# Web image (TASK-001). Build from the repository root: docker build -f web/Dockerfile .
# Serves the production build with unprivileged nginx (user 101, port 8080) and proxies /api to the API.

FROM node:24.22.2-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY web/package.json web/
COPY api/package.json api/
RUN npm ci --workspace web
COPY web/ web/
# "build" also runs check:build (bundled font, no external hosts, no reference page).
RUN npm run build --workspace web

FROM nginxinc/nginx-unprivileged:1.30.6-alpine
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/web/dist /usr/share/nginx/html
EXPOSE 8080
