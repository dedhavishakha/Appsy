# Appsy's admin (the Shopify app) with the editor's phone preview, in one image.
#
# Build from the repository root, because the admin uses the shared packages/ and the
# phone app (for the preview):
#   docker build -f apps/admin/Dockerfile -t appsy-admin .
#
# Run on the EC2 server: the app listens on 3000 inside the container, published as 3001 on
# the server only (127.0.0.1); nginx serves it to the internet as https://appsy.scopegen.in.
# The env file holds no database password (scripts/start.mjs reads it from Secrets Manager),
# and published designs live in a folder on the server, so redeploys keep them:
#   docker run -d --name appsy-admin --restart unless-stopped -p 127.0.0.1:3001:3000 \
#     --env-file /srv/appsy/appsy.env \
#     -v /srv/appsy/storage:/repo/apps/admin/.storage \
#     appsy-admin
#
# Building needs a few GB of memory (the phone preview build). On a server shared with
# another app, build elsewhere (for example GitHub Actions) and pull the finished image.

# 1. The editor's phone preview: the phone app's web build, from the root install.
FROM node:22-bookworm-slim AS preview
ENV CI=1 EXPO_NO_TELEMETRY=1
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages ./packages
COPY apps/mobile ./apps/mobile
RUN npm ci --no-audit --no-fund
# Writes apps/admin/.preview (apps/mobile/scripts/build-preview.mjs).
RUN mkdir -p apps/admin && node apps/mobile/scripts/build-preview.mjs

# 2. The admin, with its own install (React 18), built for production.
FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
COPY packages ./packages
COPY apps/admin/package.json apps/admin/package-lock.json ./apps/admin/
RUN cd apps/admin && npm ci --no-audit --no-fund
COPY apps/admin ./apps/admin
RUN cd apps/admin && npx prisma generate && npm run build && npm prune --omit=dev

# 3. What runs on the server.
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production PORT=3000
WORKDIR /repo/apps/admin
COPY --from=build /repo/packages /repo/packages
COPY --from=build /repo/apps/admin /repo/apps/admin
COPY --from=preview /repo/apps/admin/.preview /repo/apps/admin/.preview
EXPOSE 3000
CMD ["node", "scripts/start.mjs"]
