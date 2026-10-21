# Built from the REPOSITORY ROOT, not from apps/api: this is a pnpm workspace,
# so the lockfile and pnpm-workspace.yaml live at the root and the install has
# to see them. Railway must therefore have its Root Directory left at the repo
# root, with this file given as the Dockerfile path.
FROM node:22-alpine

WORKDIR /app

RUN corepack enable

# Manifests first, so a code-only change reuses the cached install layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/

# Only this service's dependencies. --ignore-scripts because nothing here has a
# build step and a postinstall script has no business running in a deploy image.
RUN pnpm install --filter @artwall/api --frozen-lockfile --ignore-scripts

COPY apps/api/src ./apps/api/src

# Runs as a non-root user. `node` already exists in this image.
USER node

# Documentation only; Railway injects the real PORT at runtime.
EXPOSE 8080

CMD ["node", "apps/api/src/index.js"]
