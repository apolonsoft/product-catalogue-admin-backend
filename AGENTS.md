# Agent Guide

This file is intended for AI coding agents working on this project. It describes the project's architecture, conventions, and daily commands based on the actual source tree.

## Project Overview

- **Name:** `product-catalogue-admin-backend`
- **Framework:** [NestJS](https://nestjs.com/) v11, written in TypeScript.
- **Purpose:** Administrative backend for a product catalogue. The codebase is currently a fresh NestJS starter with only the root `AppModule` wired up; no domain modules, controllers, or database models exist yet.
- **Package manager:** Yarn (`yarn.lock` is present).
- **Node version:** `v24.15.0` (recorded in `.nvmrc`).

## Technology Stack

- **Runtime:** Node.js
- **Framework:** NestJS 11 + Express platform (`@nestjs/platform-express`)
- **Language:** TypeScript 5.7 with `ts-node` for development and `ts-jest` for tests
- **ORM:** Prisma 7.8 with a PostgreSQL datasource
- **Cache:** `@nestjs/cache-manager` backed by `keyv` (in-memory LRU + Redis on `redis://localhost:6379`)
- **Configuration:** `@nestjs/config` + environment variables
- **Security:** `helmet`, `cors`, `cookie-parser`, `csrf-csrf`, `express-session`, `compression`, class-validator/class-transformer validation pipe
- **Authentication libraries present (not yet wired):** `@nestjs/jwt`, `@nestjs/passport`, `passport-jwt`, `passport-local`, `bcrypt`
- **Scheduling library present (not yet wired):** `@nestjs/schedule`
- **Rate limiting library present (not yet wired):** `@nestjs/throttler`

## Project Structure

```text
.
├── dist/                  # Compiled output (deleted and rebuilt by `nest build`)
├── prisma/
│   ├── schema.prisma      # Prisma schema (currently has no models)
│   └── migrations/        # Migration directory referenced by prisma.config.ts
├── src/                   # Application source
│   ├── main.ts            # Bootstrap: middleware, pipes, listen
│   ├── app.module.ts      # Root module
│   ├── app.controller.ts  # Root controller
│   ├── app.service.ts     # Root service
│   └── app.controller.spec.ts
├── test/                  # End-to-end tests
│   ├── app.e2e-spec.ts
│   └── jest-e2e.json
├── .env                   # DATABASE_URL, CSRF_SECRET, PORT, etc.
├── prisma.config.ts       # Prisma config (reads DATABASE_URL from env)
├── nest-cli.json          # Nest CLI configuration
├── tsconfig.json          # Base TypeScript config
├── tsconfig.build.json    # Production build config (excludes test/spec files)
└── eslint.config.mjs      # ESLint flat config
```

### Key Configuration Files

- `package.json` — scripts, dependencies, Jest configuration.
- `tsconfig.json` — targets `ES2023`, uses `nodenext` module resolution, emits to `./dist`, enables decorators and strict null checks.
- `tsconfig.build.json` — extends `tsconfig.json` and excludes `node_modules`, `test`, `dist`, and `**/*spec.ts`.
- `nest-cli.json` — source root is `src`; build deletes `dist` first (`deleteOutDir: true`).
- `prisma.config.ts` — defines the schema path, migrations path, and datasource URL from `process.env.DATABASE_URL`.
- `prisma/schema.prisma` — currently empty apart from generator/client and datasource declarations. The Prisma client is generated to `../generated/prisma`.
- `.prettierrc` — `singleQuote: true`, `trailingComma: all`.
- `eslint.config.mjs` — flat config using `@eslint/js`, `typescript-eslint`, and `eslint-plugin-prettier/recommended`.

## Build and Run Commands

Install dependencies:

```bash
yarn install
```

Development:

```bash
yarn start        # single run
yarn start:dev    # watch mode
yarn start:debug  # debug + watch
```

Production build and run:

```bash
yarn build        # nest build; outputs to dist/
yarn start:prod   # node dist/main
```

## Code Style Guidelines

- TypeScript with decorators; single quotes; trailing commas everywhere Prettier allows.
- ESLint extends the recommended TypeScript type-checked rules. Some rules are relaxed:
  - `@typescript-eslint/no-explicit-any` is off.
  - `@typescript-eslint/no-floating-promises` and `@typescript-eslint/no-unsafe-argument` are warnings.
  - `prettier/prettier` is an error with `endOfLine: auto`.
- Format and fix lint:

```bash
yarn format       # prettier --write src/**/*.ts test/**/*.ts
yarn lint         # eslint {src,apps,libs,test}/**/*.ts --fix
```

## Testing Instructions

Unit tests (Jest, rootDir `src`, matches `*.spec.ts`):

```bash
yarn test
yarn test:watch
yarn test:cov
yarn test:debug
```

End-to-end tests (config `test/jest-e2e.json`, matches `*.e2e-spec.ts`):

```bash
yarn test:e2e
```

Current tests only cover the default `AppController.getHello()` endpoint returning `"Hello World!"`.

## Environment and Runtime Architecture

- The HTTP server is created in `src/main.ts`.
- Global middleware stack:
  - CORS (`app.enableCors()`)
  - Helmet
  - Cookie parser
  - CSRF protection via `csrf-csrf` (reads `CSRF_SECRET` from env; session identifier falls back to `req.ip`)
  - Express sessions with a hardcoded secret (`'my-secret'`) — this should be moved to an environment variable for real deployments
  - Response compression
  - Global `ValidationPipe`
- The app listens on `process.env.PORT` or `3000`.
- The root `AppModule` imports `ConfigModule.forRoot()` and registers a cache manager with memory and Redis stores.
- Prisma is configured through `prisma.config.ts`; the schema expects PostgreSQL via `DATABASE_URL`.

## Security Considerations

- The session secret is currently hardcoded in `src/main.ts` (`secret: 'my-secret'`). Change it to read from an environment variable before any real deployment.
- CSRF protection requires `CSRF_SECRET` to be set.
- `DATABASE_URL` is stored in `.env`, which is ignored by Git.
- `generated/prisma` is also ignored by Git.
- Several security-related packages (`passport`, JWT, bcrypt, throttler) are installed but not yet configured. When adding authentication, prefer environment-driven secrets and rate-limiting on public endpoints.

## Deployment Notes

- Build output goes to `dist/`. Production start command is `node dist/main`.
- The project expects:
  - PostgreSQL reachable via `DATABASE_URL`
  - Redis reachable at `redis://localhost:6379` (default cache configuration)
- No Dockerfile, CI/CD pipeline, or platform-specific deployment config exists yet.

## Current State

This is a newly initialized NestJS project (two commits in Git history). It has the default `AppModule` and security/utility dependencies installed, but no business logic, Prisma models, migrations, or authentication implementation yet. Any new feature should be added as a NestJS module under `src/` and registered in `AppModule`.
