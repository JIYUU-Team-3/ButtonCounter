# syntax=docker/dockerfile:1

# Build stage: needs devDependencies (vite, svelte-kit) to compile.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Assert the adapter actually emitted a server. adapter-auto silently produces
# nothing when it cannot detect a platform, which fails confusingly later.
RUN npx vite build && test -f build/index.js

# Runtime deps only, so the final image stays small.
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY package.json ./
EXPOSE 3000
CMD ["node", "build"]
