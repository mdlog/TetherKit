# Build context: the repository root (the relay imports its wire types from tetherkit-core).
#   docker build -f signaling-relay/Dockerfile -t tetherkit-relay .
FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
# Every workspace manifest is needed for the frozen-lockfile check; only the relay's deps get installed.
COPY tetherkit-core/package.json tetherkit-core/
COPY signaling-relay/package.json signaling-relay/
COPY tether-deck/package.json tether-deck/
COPY phantom-beam/package.json phantom-beam/
RUN pnpm install --frozen-lockfile --filter signaling-relay...
COPY tetherkit-core/src/transport/signal-types.ts tetherkit-core/src/transport/
COPY signaling-relay/src signaling-relay/src
COPY signaling-relay/tsconfig.json signaling-relay/
RUN pnpm --filter signaling-relay build

# Runtime: a single bundled file, no node_modules.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080
COPY --from=build /repo/signaling-relay/dist/server.cjs ./server.cjs
USER node
EXPOSE 8080
CMD ["node", "server.cjs"]
