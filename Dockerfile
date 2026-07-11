# syntax=docker/dockerfile:1

# ---- base: Node 22 + pnpm ----
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.2.0 --activate
WORKDIR /app

# ---- build: instala deps e compila TypeScript -> dist/ ----
FROM base AS build
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --no-frozen-lockfile
COPY . .
RUN pnpm run build

# ---- runner: imagem final, só deps de produção ----
FROM base AS runner
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --no-frozen-lockfile --prod
COPY --from=build /app/dist ./dist

# Porta HTTP do transporte remoto (Coolify injeta/mapeia PORT).
EXPOSE 8080

# Sobe o transporte HTTP (não o stdio). A API key do branor-os chega por
# conexão (header Authorization: Bearer <apiKey>) — nada de token fixo aqui.
CMD ["node", "dist/http.js"]
