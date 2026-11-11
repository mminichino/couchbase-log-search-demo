# Same Debian-slim Node base for build and runtime so couchbase native bindings match.
FROM node:22-bookworm-slim AS base
WORKDIR /app

FROM base AS deps
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
# couchbase install.js resolves optional @couchbase/* platform packages.
RUN npm install --foreground-scripts \
 && test -d node_modules/@couchbase/couchbase-linux-x64-napi \
 && find node_modules/@couchbase -name '*.node' | grep .

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# couchbase is serverExternalPackages — copy JS package, platform prebuild, and runtime deps.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/couchbase ./node_modules/couchbase
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@couchbase ./node_modules/@couchbase
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/detect-libc ./node_modules/detect-libc
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/hdr-histogram-js ./node_modules/hdr-histogram-js

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
