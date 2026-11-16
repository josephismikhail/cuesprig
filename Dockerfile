FROM node:22-bookworm-slim
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY sync/ sync/
COPY phone/ phone/
COPY public/ public/
RUN mkdir -p /data && chown node:node /data

ENV NODE_ENV=production \
    CUESPRIG_SYNC_HOST=0.0.0.0 \
    CUESPRIG_SYNC_PORT=4318 \
    CUESPRIG_SYNC_FILE=/data/calendar.json
USER node
EXPOSE 4318
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:' + process.env.CUESPRIG_SYNC_PORT + '/healthz').then(r => { if (!r.ok) process.exitCode = 1 }).catch(() => { process.exitCode = 1 })"
CMD ["node", "sync/server.mjs"]
