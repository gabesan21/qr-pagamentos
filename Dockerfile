# syntax=docker/dockerfile:1.12
ARG NODE_IMAGE=node:24.18.0-bookworm-slim@sha256:cb4e8f7c443347358b7875e717c29e27bf9befc8f5a26cf18af3c3dec80e58c5

FROM ${NODE_IMAGE} AS toolchain
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates openssl \
 && rm -rf /var/lib/apt/lists/* \
 && npm install --global pnpm@11.13.0
WORKDIR /workspace

FROM toolchain AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM dependencies AS builder
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm db:generate && pnpm build \
 && pnpm --filter qr-pagamentos deploy --prod --legacy /runtime-dependencies

FROM toolchain AS db-ops
ENV NODE_ENV=production
COPY --from=dependencies --chown=1000:1000 /workspace/node_modules ./node_modules
COPY --chown=1000:1000 package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
COPY --chown=1000:1000 prisma ./prisma
COPY --chown=1000:1000 container ./container
USER 1000:1000
ENTRYPOINT ["node"]

FROM ${NODE_IMAGE} AS app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app
COPY --from=builder --chown=1000:1000 /workspace/.next/standalone ./
COPY --from=builder --chown=1000:1000 /workspace/.next/static ./.next/static
COPY --from=builder --chown=1000:1000 /workspace/public ./public
COPY --from=builder --chown=1000:1000 /runtime-dependencies/node_modules ./node_modules
COPY --chown=1000:1000 container/lib.mjs container/runtime.mjs container/healthcheck.mjs ./container/
USER 1000:1000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=6 CMD ["node", "container/healthcheck.mjs"]
ENTRYPOINT ["node", "container/runtime.mjs"]
