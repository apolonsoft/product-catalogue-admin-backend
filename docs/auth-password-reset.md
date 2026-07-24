# Auth Password Reset

The auth password reset flow lets an active admin user request a password reset email and then set a new password with a one-time token.

The endpoints are public. They do not require a JWT because users call them when they cannot sign in.

## Endpoints

### Forgot Password

```http
POST /auth/password/forgot
Content-Type: application/json
```

Request body:

```json
{
  "email": "admin@example.com"
}
```

Validation:

- `email` is required.
- `email` must be a valid email address.

Successful response:

```http
204 No Content
```

Server behavior:

- Looks up the user by email.
- Returns successfully without creating a token when the user does not exist, is not active, or has no password hash.
- Creates a random reset token for active password users.
- Stores only a SHA-256 hash of the token in `password_reset_tokens.token_hash`.
- Sets `expiresAt` from `PASSWORD_RESET_EXPIRES_IN_MINUTES`.
- Builds a reset link in the form `${APP_URL}/auth/password/reset?token=<token>`.
- Sends the reset link through `MailService.sendPasswordReset`.

The endpoint intentionally returns the same `204 No Content` response for eligible and ineligible emails. This prevents callers from using the endpoint to discover whether an account exists.

### Reset Password

```http
POST /auth/password/reset
Content-Type: application/json
```

Request body:

```json
{
  "token": "reset-token-from-email",
  "password": "NewPassword123!"
}
```

Validation:

- `token` is required.
- `password` must be at least 8 characters.

Successful response:

```http
204 No Content
```

Server behavior:

- Hashes the submitted token with SHA-256 and looks up `password_reset_tokens.token_hash`.
- Rejects missing, already consumed, expired, or inactive-user tokens.
- Hashes the new password with the shared user password hashing flow.
- Updates the user's password hash.
- Increments `User.tokenVersion` to invalidate existing JWT sessions.
- Marks the reset token as consumed by setting `consumedAt`.
- Performs the user update and token consumption in a single Prisma transaction.

Failure cases:

- `404 Not Found` when the reset token is invalid.
- `400 Bad Request` when the reset token has already been used.
- `400 Bad Request` when the reset token has expired.
- `400 Bad Request` when the token's user account is not active.
- `400 Bad Request` when request validation fails.

## Password Reset Flow

1. Client calls `POST /auth/password/forgot` with the user's email address.
2. Backend returns `204 No Content` for all validly shaped requests.
3. If the account is an active password account, backend stores a hashed reset token and sends an email.
4. User opens the emailed link: `${APP_URL}/auth/password/reset?token=<token>`.
5. Client collects the new password and calls `POST /auth/password/reset`.
6. Backend validates and consumes the token, stores the new password hash, and increments `tokenVersion`.
7. User signs in again with the new password.

## Data Model Usage

The flow uses `PasswordResetToken` and `User.tokenVersion`.

Important fields:

- `PasswordResetToken.userId`: owner of the reset token.
- `PasswordResetToken.tokenHash`: unique SHA-256 hash of the raw email token.
- `PasswordResetToken.expiresAt`: time after which the token can no longer be used.
- `PasswordResetToken.consumedAt`: set after a successful password reset to prevent reuse.
- `User.tokenVersion`: included in signed JWT payloads and incremented after reset to invalidate previous sessions.

Raw reset tokens are never stored. Only the email recipient receives the raw token as part of the reset link.

## Configuration

Required for production:

```env
APP_URL=https://admin.example.com
JWT_SECRET=change-me-in-production
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_FROM=no-reply@example.com
```

Optional:

```env
PASSWORD_RESET_EXPIRES_IN_MINUTES=30
```

Configuration behavior:

- `APP_URL` defaults to `http://localhost:3000` and is used as the base URL for reset links.
- `PASSWORD_RESET_EXPIRES_IN_MINUTES` defaults to `30`.
- `SMTP_HOST` defaults to `localhost`.
- `SMTP_PORT` defaults to `1025`.
- `SMTP_FROM` defaults to `no-reply@example.com`.

Common local development values with Mailpit:

```env
APP_URL=http://localhost:5173
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_FROM=no-reply@example.com
PASSWORD_RESET_EXPIRES_IN_MINUTES=30
```

## Email Delivery

`MailService.sendPasswordReset` sends both plain text and HTML email bodies. Both include the reset link and a note that the user can ignore the email if they did not request the reset.

The current Nodemailer transport is configured from SMTP host and port only. Add authentication and TLS options before using an SMTP provider that requires them.

## Related Code

- `src/auth/auth.controller.ts`: public forgot-password and reset-password HTTP endpoints.
- `src/auth/auth.service.ts`: token generation, hashing, validation, password update, and session invalidation.
- `src/auth/dto/forgot-password.dto.ts`: forgot-password request validation.
- `src/auth/dto/reset-password.dto.ts`: reset-password request validation.
- `src/mail/mail.service.ts`: password reset email delivery.
- `prisma/models/user.prisma`: `PasswordResetToken` model and `User.tokenVersion`.
- `prisma/migrations/20260715074738_password_reset_and_token_version/migration.sql`: database changes for reset tokens and JWT token versions.
