FROM node:22-alpine AS base
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts
COPY . .

# Typecheck stage (used by CI)
FROM base AS typecheck
RUN npm run typecheck

# Dev stage — runs wrangler dev
FROM base AS dev
EXPOSE 8787
CMD ["npx", "wrangler", "dev", "--local", "--port", "8787"]
