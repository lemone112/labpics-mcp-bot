# --- deps stage: install all dependencies ---
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY apps/telegram-bot/package.json ./apps/telegram-bot/
COPY packages/shared-types/package.json ./packages/shared-types/
RUN npm ci -w apps/web

# --- build stage: produce .next output ---
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY apps/web/ .

ARG NEXT_PUBLIC_API_BASE_URL=/api
ARG API_UPSTREAM_URL=http://server:8080
ARG NEXT_PUBLIC_CSRF_COOKIE_NAME=csrf_token
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV API_UPSTREAM_URL=$API_UPSTREAM_URL
ENV NEXT_PUBLIC_CSRF_COOKIE_NAME=$NEXT_PUBLIC_CSRF_COOKIE_NAME

RUN npm run build

# --- runner stage: minimal production image ---
FROM node:22-alpine AS runner
RUN addgroup -g 1001 -S app && adduser -S -u 1001 -G app app
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --chown=app:app apps/web/package.json ./package.json

RUN npm prune --omit=dev

USER app
EXPOSE 3000
CMD ["npm", "run", "start"]
