# Agent Guide

This file is intended for AI coding agents working on this project. It describes the project's architecture, conventions, and daily commands based on the actual source tree.

## Project Overview

- **Name:** `product-catalogue-admin-backend`
- **Framework:** [NestJS](https://nestjs.com/) v11, written in TypeScript.
- **Purpose:** Administrative backend for a product catalogue.
- **Package manager:** Yarn (`yarn.lock` is present).
- **Node version:** `v24.15.0` (recorded in `.nvmrc`).

## Technology Stack

- **Runtime:** Node.js
- **Framework:** NestJS 11 + Express platform (`@nestjs/platform-express`)
- **Language:** TypeScript 5.7 with `ts-node` for development and `ts-jest` for tests
- **ORM:** Prisma 7.8 with a PostgreSQL datasource and the `@prisma/adapter-pg` driver adapter
- **Cache:** `@nestjs/cache-manager` backed by `keyv` (in-memory LRU + Redis on `redis://localhost:6379`)
- **Configuration:** `@nestjs/config` + environment variables
- **Security:** `helmet`, `cors`, `compression`, class-validator/class-transformer validation pipe
- **Authentication:** `@nestjs/jwt`, `@nestjs/passport`, `passport-jwt`, `bcrypt`
- **Scheduling library present (not yet wired):** `@nestjs/schedule`
- **Rate limiting library present (not yet wired):** `@nestjs/throttler`

## Project Structure

```text
.
├── dist/                  # Compiled output (deleted and rebuilt by `nest build`)
├── prisma/
│   ├── schema.prisma      # Prisma schema with User and UserInvitation models
│   └── migrations/        # Migration directory referenced by prisma.config.ts
├── src/                   # Application source
│   ├── main.ts            # Bootstrap: middleware, pipes, listen
│   ├── app.module.ts      # Root module; seeds default admin on init
│   ├── app.controller.ts  # Root controller
│   ├── app.service.ts     # Root service
│   ├── prisma/            # Prisma module, service, and client barrel
│   ├── users/             # Users module and service
│   └── auth/              # Auth module, controller, service, guards, decorators, DTOs
├── test/                  # End-to-end tests and Prisma mock helpers
│   ├── app.e2e-spec.ts
│   ├── auth.e2e-spec.ts
│   ├── mock-prisma.ts
│   ├── prisma-client.mock.ts
│   └── jest-e2e.json
├── .env                   # DATABASE_URL, JWT_SECRET, DEFAULT_ADMIN_*, etc.
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
- `prisma/schema.prisma` — defines `User`, `UserInvitation`, `Role`, and `UserStatus`. The Prisma client is generated to `../generated/prisma`.
- `.prettierrc` — `singleQuote: true`, `trailingComma: all`.
- `eslint.config.mjs` — flat config using `@eslint/js`, `typescript-eslint`, and `eslint-plugin-prettier/recommended`.

## Build and Run Commands

Install dependencies and generate the Prisma client:

```bash
yarn install
npx prisma generate
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

## Environment and Runtime Architecture

- The HTTP server is created in `src/main.ts`.
- Global middleware stack:
  - CORS (`app.enableCors()`)
  - Helmet
  - Response compression
  - Global `ValidationPipe`
- The app listens on `process.env.PORT` or `3000`.
- The root `AppModule` imports `ConfigModule.forRoot()`, registers a cache manager with memory and Redis stores, and seeds a default `ADMIN` user from `DEFAULT_ADMIN_EMAIL` / `DEFAULT_ADMIN_PASSWORD` on startup if that email does not exist.
- Prisma is configured through `prisma.config.ts`; the schema expects PostgreSQL via `DATABASE_URL` and uses the `@prisma/adapter-pg` driver adapter.
- Authentication is JWT bearer based. Public endpoints: `POST /auth/login` and `POST /auth/invitations/accept`. Protected endpoints require `Authorization: Bearer <token>`.
- `POST /auth/invitations` is restricted to users with the `ADMIN` role.
- Profile endpoints (`/profile`) allow authenticated users to edit their first/last name, change their password, and upload an avatar via presigned S3/MinIO PUT URLs.
- Avatars are persisted through the existing `Upload` / `File` Prisma models and served from `S3_PUBLIC_BASE_URL`.

### Required Environment Variables

- `DATABASE_URL` — PostgreSQL connection string.
- `JWT_SECRET` — Secret used to sign JWTs.
- `JWT_EXPIRES_IN` — JWT expiry (default `1h`).
- `DEFAULT_ADMIN_EMAIL` / `DEFAULT_ADMIN_PASSWORD` — Credentials for the auto-created admin.
- `INVITE_EXPIRES_IN_DAYS` — Invitation token lifetime (default `7`).
- `APP_URL` — Base URL used to build invitation links.
- `S3_ENDPOINT` — S3/MinIO endpoint (e.g. `http://localhost:9000`).
- `S3_REGION` — AWS region (default `us-east-1`).
- `S3_BUCKET` — S3/MinIO bucket name.
- `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` — S3 credentials.
- `S3_FORCE_PATH_STYLE` — Set to `true` for MinIO compatibility.
- `S3_PUBLIC_BASE_URL` — Public base URL used to build `File.link` values.
- `AVATAR_MAX_BYTES` — Maximum avatar file size in bytes (default `5242880`).

## Security Considerations

- `DATABASE_URL` is stored in `.env`, which is ignored by Git.
- `generated/prisma` is also ignored by Git.
- Invitation tokens are returned in full only once from `POST /auth/invitations`; only SHA-256 hashes are stored.
- Passwords are stored as bcrypt hashes and never returned in API responses.
- CSRF and session middleware were removed because authentication uses stateless bearer tokens.

## Deployment Notes

- Build output goes to `dist/`. Production start command is `node dist/main`.
- The project expects:
  - PostgreSQL reachable via `DATABASE_URL`
  - Redis reachable at `redis://localhost:6379` (default cache configuration)
- Run `npx prisma migrate deploy` against the production database before starting the app.
- No Dockerfile, CI/CD pipeline, or platform-specific deployment config exists yet.

## Current State

The project has a working JWT authentication and invitation system, authenticated profile APIs (name, password, and avatar upload), and S3-compatible storage via the AWS SDK v3. It includes `User`, `UserInvitation`, `Upload`, and `File` Prisma models, default admin seeding, ADMIN/USER roles, and unit plus E2E test coverage. New business features should be added as NestJS modules under `src/` and registered in `AppModule`.
