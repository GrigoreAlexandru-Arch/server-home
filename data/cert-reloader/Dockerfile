FROM node:20-alpine

COPY cert-reload.mjs /app/cert-reload.mjs

# dockerode (pure-Node Docker Engine client) — no docker CLI/curl needed.
# Runtime is offline, so install at build time.
RUN cd /app && npm install dockerode

CMD ["node", "/app/cert-reload.mjs"]