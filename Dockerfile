# ---- Stage 1: build the React/shadcn client ----
FROM node:22-alpine AS client
WORKDIR /client
COPY client/package.json client/package-lock.json* ./
RUN npm install
COPY client/ ./
RUN npm run build

# ---- Stage 2: server runtime ----
FROM node:22-alpine
WORKDIR /app

# Server deps
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Server source
COPY . .

# Built frontend from stage 1
COPY --from=client /client/dist ./client/dist

# translations.json lives here; mount a volume to persist.
RUN mkdir -p /data
ENV DATA_FILE=/data/translations.json
ENV STRINGS_FILE=/app/strings.xml
ENV PORT=3000

EXPOSE 3000

CMD ["node", "server.js"]
