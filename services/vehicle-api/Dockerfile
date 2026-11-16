# Build from the repo root so pnpm sees the workspace lockfile:
#   docker build -f services/vehicle-api/Dockerfile .
FROM node:22-slim AS build
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY services/vehicle-api/package.json services/vehicle-api/
RUN pnpm install --frozen-lockfile --filter vehicle-api
COPY services/vehicle-api services/vehicle-api
RUN pnpm --filter vehicle-api build \
 && pnpm --filter vehicle-api deploy --prod --legacy /out \
 && cp -r services/vehicle-api/dist /out/dist

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out .
USER node
CMD ["node", "dist/src/server.js"]
