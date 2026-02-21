FROM node:22-alpine AS base
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts
COPY . .
RUN addgroup --system --gid 1001 app && adduser --system --uid 1001 app
RUN chown -R app:app /app

# Typecheck stage (used by CI)
FROM base AS typecheck
USER app
RUN npm run typecheck

# Dev stage — runs wrangler dev
FROM base AS dev
USER app
EXPOSE 8787
CMD ["npx", "wrangler", "dev", "--local", "--port", "8787"]
