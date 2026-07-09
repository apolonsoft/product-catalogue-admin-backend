# syntax=docker/dockerfile:1

# ---------- Builder stage ----------
FROM node:22-alpine AS builder
WORKDIR /app

# Prisma needs OpenSSL at generate/runtime time; build-base is for native modules.
RUN apk add --no-cache openssl build-base

# Enable Yarn via Corepack.
RUN corepack enable

# Copy dependency manifests and Prisma schema first to leverage Docker cache.
COPY package.json yarn.lock ./
COPY prisma ./prisma

# Install dependencies. The postinstall script runs Prisma generate.
RUN yarn install --frozen-lockfile

# Copy the rest of the source and build the NestJS application.
COPY . .
RUN yarn build

# ---------- Production stage ----------
FROM node:22-alpine AS production
WORKDIR /app

RUN apk add --no-cache openssl
RUN corepack enable

ENV NODE_ENV=production

# Copy the built application, dependencies, and generated Prisma client.
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/generated ./generated

CMD ["yarn", "start:prod"]
