# syntax=docker/dockerfile:1

# Node 24, the engines field in package.json. pnpm is the version that wrote pnpm-lock.yaml.
FROM node:24-alpine AS deps
WORKDIR /app
RUN npm install -g pnpm@12.21.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY web/package.json ./web/package.json
RUN pnpm install --frozen-lockfile

FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/web/node_modules ./web/node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# A Server Action's id is a hash salted with the actions encryption key, and
# Next draws a fresh key for every build that is not given one. The app defines
# none, but Clerk's provider calls one when the session changes
# (@clerk/nextjs dist/esm/app-router/client/ClerkProvider.js, invalidateCacheAction).
# A tab left open across a deploy then calls an id the new server never heard of,
# and signing in fails. One key kept across builds keeps the id; the deployment id
# lets a stale tab notice it is stale and load the page again.
ARG NEXT_DEPLOYMENT_ID
ENV NEXT_DEPLOYMENT_ID=$NEXT_DEPLOYMENT_ID
# The app in web/ imports the agent core's TypeScript from the repository root;
# Next compiles it into the server bundle and traces it into the standalone output.
WORKDIR /app/web
RUN --mount=type=secret,id=actions_key,env=NEXT_SERVER_ACTIONS_ENCRYPTION_KEY \
    ./node_modules/.bin/next build
# The runner has no node_modules of its own, so the migrator ships as one
# self-contained file rather than as a script plus a TypeScript runtime.
RUN ./node_modules/.bin/esbuild src/db/migrate.ts \
    --bundle --platform=node --format=esm --outfile=migrate.mjs

FROM node:24-alpine AS runner
# The core watches videos with ffmpeg and reads their length with ffprobe (src/video/).
RUN apk add --no-cache ffmpeg
WORKDIR /app
# Next's standalone server binds to HOSTNAME, which Docker sets to the
# container's id; 0.0.0.0 makes it answer on every interface, localhost included.
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
# The standalone output keeps the workspace layout: the server is web/server.js.
COPY --from=builder /app/web/.next/standalone ./
COPY --from=builder /app/web/public ./web/public
COPY --from=builder /app/web/.next/static ./web/.next/static
# The migrator reads the journal and the SQL it lists; the schema snapshots
# beside them are only for drizzle-kit.
COPY --from=builder /app/web/drizzle/*.sql ./web/drizzle/
COPY --from=builder /app/web/drizzle/meta/_journal.json ./web/drizzle/meta/_journal.json
COPY --from=builder /app/web/migrate.mjs ./web/migrate.mjs
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh && chown -R app:app /app
USER app
WORKDIR /app/web
EXPOSE 3000
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "server.js"]
