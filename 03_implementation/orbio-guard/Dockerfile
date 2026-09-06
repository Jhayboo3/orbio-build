FROM node:24-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY scripts ./scripts
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production \
    ORBIO_GUARD_HOST=0.0.0.0 \
    ORBIO_GUARD_OAUTH_CALLBACK_BIND_HOST=0.0.0.0 \
    ORBIO_GUARD_OAUTH_CALLBACK_HOST=127.0.0.1 \
    ORBIO_GUARD_STATE_DIR=/home/node/.orbio-guard

WORKDIR /app
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
RUN mkdir -p /home/node/.orbio-guard && chown node:node /home/node/.orbio-guard && chmod 700 /home/node/.orbio-guard

USER node
VOLUME ["/home/node/.orbio-guard"]
EXPOSE 4318 4319

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4318/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "dist/cli.js", "serve"]
