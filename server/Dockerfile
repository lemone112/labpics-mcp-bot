FROM node:22-alpine

RUN addgroup -g 1001 -S app && adduser -S -u 1001 -G app app

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --chown=app:app . .

USER app

EXPOSE 8080

CMD ["npm", "start"]
