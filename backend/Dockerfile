# Genesis CRM backend — production image (PRD E-14).
#   docker build -t genesis-backend ./backend
# The container applies pending migrations, then starts the API on $PORT.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY prisma ./prisma
RUN npx prisma generate

FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=3001 HOST=0.0.0.0
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY prisma ./prisma
COPY src ./src
COPY scripts ./scripts
RUN mkdir -p uploads && chown -R node:node uploads
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "npx prisma migrate deploy && node src/index.js"]
