# --- deps stage: install production dependencies ---
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# --- runner stage: minimal production image ---
FROM node:22-alpine AS runner
RUN addgroup -g 1001 -S app && adduser -S -u 1001 -G app app
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --chown=app:app package.json ./
COPY --chown=app:app src ./src
COPY --chown=app:app db ./db

USER app
EXPOSE 8080
CMD ["node", "src/index.js"]
