# Render build context contains the source archive in the GitHub repository root.
FROM node:22-alpine AS builder

RUN apk add --no-cache unzip patch
WORKDIR /app

COPY master-boy-cloudrun-production-ready.zip /tmp/master-boy-source.zip
RUN unzip -q /tmp/master-boy-source.zip -d /app

# Apply the reviewed Supabase/Render runtime changes maintained beside the archive.
COPY deploy.patch /tmp/deploy.patch
RUN patch --batch -p1 -d /app -i /tmp/deploy.patch

RUN npm install --no-audit --no-fund
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=10000

COPY --from=builder /app/package.json /app/package-lock.json ./
RUN npm ci --no-audit --no-fund --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json

EXPOSE 10000

CMD ["node_modules/.bin/tsx", "server.ts"]
