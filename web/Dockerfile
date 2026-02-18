FROM node:22-alpine

RUN addgroup -g 1001 -S app && adduser -S -u 1001 -G app app

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG NEXT_PUBLIC_API_BASE_URL=/api
ARG API_UPSTREAM_URL=http://server:8080
ARG NEXT_PUBLIC_CSRF_COOKIE_NAME=csrf_token
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV API_UPSTREAM_URL=$API_UPSTREAM_URL
ENV NEXT_PUBLIC_CSRF_COOKIE_NAME=$NEXT_PUBLIC_CSRF_COOKIE_NAME

RUN npm run build && npm prune --omit=dev

RUN chown -R app:app .next

ENV NODE_ENV=production

USER app

EXPOSE 3000

CMD ["npm", "run", "start"]
