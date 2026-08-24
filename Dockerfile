# Builds and runs the public online demo (DEMO_MODE=true) as a single, self-contained
# container: one process serves both the API and the built client SPA (see
# server/src/app.ts's staticDir option), seeds a demo user + sample project on first
# boot (server/src/lib/demoMode.ts), and needs no external services or volume mount —
# destroying the container discards everything, so nothing is ever orphaned on the
# host. Not meant for the desktop/Electron build, which packages the app differently.
#
# node:20-slim (glibc), not alpine: sharp and @napi-rs/canvas (server dependencies)
# ship prebuilt native binaries that target glibc most reliably.

FROM node:20-slim AS build
WORKDIR /app

# Copy only the package manifests first so `npm install` is cached across builds that
# only change source, not dependencies.
COPY package.json package-lock.json ./
COPY server/package.json server/package-lock.json ./server/
COPY client/package.json client/package-lock.json ./client/
RUN npm install

COPY . .
RUN npm run build

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/server/dist ./server/dist
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev

COPY --from=build /app/client/dist ./client/dist

# Sample pages for the seeded demo project — see server/demo-seed/README.md for the
# expected layout. Not produced by the TS build, copied straight from the build
# context instead of the build stage.
COPY server/demo-seed ./server/demo-seed

ENV DEMO_MODE=true
ENV CLIENT_DIST_DIR=/app/client/dist
ENV LETTERING_DATA_DIR=/app/data
ENV PORT=3001
EXPOSE 3001

CMD ["node", "server/dist/server/src/index.js"]
