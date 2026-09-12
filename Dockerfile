# --- build the frontend ---
FROM node:20-slim AS webbuild
WORKDIR /repo
COPY web/package.json web/package.json
RUN npm --prefix web install
COPY web web
RUN npm --prefix web run build

# --- runtime image ---
FROM node:20-slim
WORKDIR /app

# better-sqlite3 needs build tools to compile its native addon
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY server/package.json server/package.json
RUN npm --prefix server install --omit=dev

COPY server server
COPY --from=webbuild /repo/web/dist web/dist
COPY scripts scripts

ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV PORT=3000
VOLUME ["/data"]
EXPOSE 3000

CMD ["node", "server/src/index.js"]
