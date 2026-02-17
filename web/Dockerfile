FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG NEXT_PUBLIC_API_BASE_URL=/api
ARG API_UPSTREAM_URL=http://server:8080
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV API_UPSTREAM_URL=$API_UPSTREAM_URL

RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start"]
