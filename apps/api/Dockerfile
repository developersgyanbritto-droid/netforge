# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm install --frozen-lockfile=false --filter @netforge/api...
RUN pnpm --filter @netforge/api exec prisma generate && pnpm --filter @netforge/api build

FROM base AS run
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4000
COPY --from=build /repo /repo
WORKDIR /repo/apps/api
USER node
EXPOSE 4000
# Apply pending migrations, then start
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
