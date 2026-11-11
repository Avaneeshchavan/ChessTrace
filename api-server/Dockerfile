FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*

FROM base AS dependencies
COPY package.json package-lock.json ./
COPY prisma/schema.prisma prisma/
RUN npm ci && npm run prisma:generate && npm prune --omit=dev

FROM base
ENV NODE_ENV=production
COPY --from=dependencies /app/node_modules ./node_modules
COPY config ./config
COPY src ./src
USER node
EXPOSE 5001
CMD ["node", "src/index.js"]
