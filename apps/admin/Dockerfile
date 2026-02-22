FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json tsconfig.base.json ./
COPY apps/admin/package.json apps/admin/package.json

RUN npm install --workspaces --include-workspace-root

COPY apps/admin apps/admin

RUN npm run build --workspace @xauto/admin

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/apps/admin /app/apps/admin

EXPOSE 8080
CMD ["npm", "run", "start", "--workspace", "@xauto/admin", "--", "-p", "8080"]
