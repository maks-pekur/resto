FROM node:22-alpine AS deps
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./
COPY apps/website/package.json apps/website/
COPY packages/api-client/package.json packages/api-client/
COPY packages/cart/package.json packages/cart/
COPY packages/ui/package.json packages/ui/
COPY packages/config-tailwind/package.json packages/config-tailwind/
COPY packages/config-eslint/package.json packages/config-eslint/
COPY packages/config-typescript/package.json packages/config-typescript/

RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS build
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY --from=deps /workspace/node_modules ./node_modules
COPY --from=deps /workspace/apps/website/node_modules ./apps/website/node_modules
COPY --from=deps /workspace/packages/api-client/node_modules ./packages/api-client/node_modules
COPY --from=deps /workspace/packages/cart/node_modules ./packages/cart/node_modules
COPY --from=deps /workspace/packages/ui/node_modules ./packages/ui/node_modules
COPY tsconfig.base.json ./
COPY apps/website ./apps/website
COPY packages/api-client ./packages/api-client
COPY packages/cart ./packages/cart
COPY packages/ui ./packages/ui
COPY packages/config-tailwind ./packages/config-tailwind
COPY packages/config-typescript ./packages/config-typescript
COPY packages/config-eslint ./packages/config-eslint

ARG NEXT_PUBLIC_API_ORIGIN
ARG WEBSITE_URL=https://resto.app
ENV NEXT_PUBLIC_API_ORIGIN=$NEXT_PUBLIC_API_ORIGIN
ENV WEBSITE_URL=$WEBSITE_URL

WORKDIR /workspace/apps/website
RUN pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /workspace/apps/website/.next/standalone ./
COPY --from=build /workspace/apps/website/.next/static ./apps/website/.next/static

USER node
ENV PORT=3002
ENV HOSTNAME=0.0.0.0
EXPOSE 3002
HEALTHCHECK --interval=15s --timeout=3s --start-period=15s --retries=3 \
  CMD wget --quiet --spider http://localhost:3002/ || exit 1
CMD ["node", "apps/website/server.js"]
