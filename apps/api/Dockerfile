FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json tsconfig.base.json ./
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY apps/api/package.json apps/api/package.json

RUN npm install --workspaces --include-workspace-root

COPY packages/shared-types packages/shared-types
COPY apps/api apps/api

RUN npm run build --workspace @xauto/shared-types
RUN npm run build --workspace @xauto/api

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/packages/shared-types/dist /app/packages/shared-types/dist
COPY --from=builder /app/apps/api/dist /app/apps/api/dist

CMD ["node", "apps/api/dist/main.js"]
