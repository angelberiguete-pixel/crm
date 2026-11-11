# Build from the CRM repository root. Independent web/worker image; no CRM DB URL.
FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /input
COPY services/openreply ./services/openreply
COPY lib/openreply-events.ts ./lib/openreply-events.ts
RUN git init -q /app && git -C /app remote add origin https://github.com/diwenne/openreply.git \
 && git -C /app fetch --depth=1 origin c78b2d2f68c9764ef7a7dde51dfa5bfa99304a09 \
 && git -C /app checkout -q FETCH_HEAD \
 && node services/openreply/prepare.mjs /app \
 && rm -rf /app/.git
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# Build-only dummy DSN. Runtime credentials are supplied by the host secret store.
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/openreply
RUN npm ci --no-audit --no-fund && npm run build

FROM node:22-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl wget && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /app /app
COPY --chown=node:node services/openreply/preflight.mjs /app/crm-preflight.mjs
COPY --chown=node:node services/openreply/entrypoint.sh /app/crm-entrypoint.sh
USER node
EXPOSE 3000
ENTRYPOINT ["sh", "/app/crm-entrypoint.sh"]
CMD ["npm", "run", "start"]
