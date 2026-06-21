FROM node:22-alpine AS deps
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./
COPY apps/admin/package.json apps/admin/
COPY packages/domain/package.json packages/domain/
COPY packages/config-eslint/package.json packages/config-eslint/
COPY packages/config-typescript/package.json packages/config-typescript/

RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS build
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY --from=deps /workspace/node_modules ./node_modules
COPY --from=deps /workspace/apps/admin/node_modules ./apps/admin/node_modules
COPY --from=deps /workspace/packages/domain/node_modules ./packages/domain/node_modules
COPY tsconfig.base.json ./
COPY apps/admin ./apps/admin
COPY packages/domain ./packages/domain
COPY packages/config-typescript ./packages/config-typescript
COPY packages/config-eslint ./packages/config-eslint

ARG NEXT_PUBLIC_API_ORIGIN
ARG ADMIN_WEB_URL=https://admin.resto.app
ARG INTERNAL_API_TOKEN=build-time-placeholder-token-32-chars
ARG ACTIVE_BRAND_COOKIE_SECRET=build-time-placeholder-secret-32chars!
ENV NEXT_PUBLIC_API_ORIGIN=$NEXT_PUBLIC_API_ORIGIN
ENV ADMIN_WEB_URL=$ADMIN_WEB_URL
ENV INTERNAL_API_TOKEN=$INTERNAL_API_TOKEN
ENV ACTIVE_BRAND_COOKIE_SECRET=$ACTIVE_BRAND_COOKIE_SECRET

WORKDIR /workspace/apps/admin
RUN pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /workspace/apps/admin/.next/standalone ./
COPY --from=build /workspace/apps/admin/.next/static ./apps/admin/.next/static

USER node
ENV PORT=3001
ENV HOSTNAME=0.0.0.0
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=3s --start-period=15s --retries=3 \
  CMD wget --quiet --spider http://localhost:3001/ || exit 1
CMD ["node", "apps/admin/server.js"]
