# --- deps stage: install production dependencies ---
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY apps/telegram-bot/package.json ./apps/telegram-bot/
COPY packages/shared-types/package.json ./packages/shared-types/
RUN npm ci -w apps/api --omit=dev

# --- runner stage: minimal production image ---
FROM node:22-alpine AS runner
RUN addgroup -g 1001 -S app && adduser -S -u 1001 -G app app
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --chown=app:app apps/api/package.json ./package.json
COPY --chown=app:app apps/api/src ./src
COPY --chown=app:app apps/api/db ./db

USER app
EXPOSE 8080
CMD ["npm", "run", "start"]
