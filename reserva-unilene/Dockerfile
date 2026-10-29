# syntax=docker/dockerfile:1
FROM node:24-alpine AS viewer
WORKDIR /viewer
COPY --from=viewer-source package.json package-lock.json index.html ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY --from=viewer-source src/floor4-viewer.js src/floor4-collision.js src/puestos-reservables.js src/texturas.js src/reservas-api.js src/floor4-walls.json src/floor4-furniture.json ./src/
COPY --from=viewer-source reserva-unilene-backend/migraciones/mapa_puestos_plano.json ./reserva-unilene-backend/migraciones/mapa_puestos_plano.json
COPY --from=viewer-source public/models/floor4.glb ./public/models/floor4.glb
RUN printf '%s\n' 'import { defineConfig } from "vite";' 'export default defineConfig({ base: "/viewer/" });' > vite.config.js && npm run build

FROM oven/bun:1.4.2 AS builder
WORKDIR /app
COPY package.json bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile
COPY angular.json tsconfig*.json .postcssrc.json ./
COPY src ./src
COPY public ./public
RUN bun run build

FROM nginxinc/nginx-unprivileged:1.28-alpine AS runtime
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist/reserva-unilene/browser /usr/share/nginx/html
COPY --from=viewer /viewer/dist /usr/share/nginx/html/viewer
COPY --from=viewer /viewer/public/models/floor4.glb /usr/share/nginx/html/models/floor4.glb
EXPOSE 8080
