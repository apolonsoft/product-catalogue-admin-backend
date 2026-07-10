# Profile Module

The profile module exposes authenticated APIs for a signed-in admin user to update personal details, change password, and manage an avatar image through S3-compatible object storage.

All endpoints are guarded by `JwtAuthGuard` and require:

```http
Authorization: Bearer <accessToken>
```

## Endpoints

### Update Profile

```http
PATCH /profile
Content-Type: application/json
```

Request body:

```json
{
  "firstName": "Ada",
  "lastName": "Lovelace"
}
```

Fields are optional. `firstName` and `lastName` may be sent independently.

Successful response:

```json
{
  "id": "user-id",
  "email": "ada@example.com",
  "phone": null,
  "firstName": "Ada",
  "lastName": "Lovelace",
  "role": "ADMIN",
  "status": "ACTIVE",
  "avatarFileId": "file-id",
  "avatarFile": {
    "id": "file-id",
    "link": "http://localhost:9000/product-catalogue/users/user-id/avatar/upload-id-avatar.png",
    "type": "image/png",
    "name": "avatar.png",
    "size": 24512,
    "status": "UPLOADED"
  }
}
```

The response is a safe user object. It never includes `passwordHash`.

### Change Password

```http
PATCH /profile/password
Content-Type: application/json
```

Request body:

```json
{
  "currentPassword": "current-password",
  "newPassword": "new-password"
}
```

Validation:

- `currentPassword` is required.
- `newPassword` must be at least 8 characters.
- The current password must match the stored bcrypt hash.

Successful response:

```http
204 No Content
```

Failure cases:

- `401 Unauthorized` when the user is missing, has no password hash, or the current password is incorrect.
- `400 Bad Request` when request validation fails.

### Initiate Avatar Upload

```http
POST /profile/avatar/uploads
Content-Type: application/json
```

Request body:

```json
{
  "name": "avatar.png",
  "type": "image/png",
  "size": 24512,
  "hash": "optional-client-hash"
}
```

Validation:

- `name` is required.
- `type` must be one of `image/jpeg`, `image/png`, or `image/webp`.
- `size` must be a positive integer.
- `size` must be less than or equal to `AVATAR_MAX_BYTES`.

Successful response:

```json
{
  "uploadId": "upload-id",
  "url": "https://signed-put-url"
}
```

Server behavior:

- Creates an `Upload` row with status `UPLOADING`.
- Generates an object key in the form `users/{userId}/avatar/{uploadId}-{safeFileName}`.
- Returns a presigned S3 `PUT` URL valid for 15 minutes.

The client must upload the file bytes directly to the returned URL using the same `Content-Type` and content length from the initiate request.

Example upload:

```bash
curl -X PUT "$SIGNED_URL" \
  -H "Content-Type: image/png" \
  --data-binary "@avatar.png"
```

### Complete Avatar Upload

```http
POST /profile/avatar/uploads/:id/complete
```

Successful response:

```json
{
  "id": "user-id",
  "email": "ada@example.com",
  "firstName": "Ada",
  "lastName": "Lovelace",
  "avatarFileId": "file-id",
  "avatarFile": {
    "id": "file-id",
    "link": "http://localhost:9000/product-catalogue/users/user-id/avatar/upload-id-avatar.png",
    "type": "image/png",
    "name": "avatar.png",
    "size": 24512,
    "status": "UPLOADED"
  }
}
```

Server behavior:

- Finds the `Upload` by id.
- Confirms the upload key belongs to the current user.
- Rejects failed uploads.
- Sends `HeadObject` to S3/MinIO before promotion.
- Verifies the stored object content type and size match the original `Upload`.
- Creates a claimed `File` row with status `UPLOADED` if the upload has not already been promoted.
- Marks the `Upload` as `UPLOADED`.
- Sets `User.avatarFileId` to the promoted file.

Failure cases:

- `404 Not Found` when the upload does not exist, belongs to another user, or the object is missing from storage.
- `400 Bad Request` when the upload failed or storage metadata does not match.

## Avatar Upload Flow

1. Client calls `POST /profile/avatar/uploads`.
2. Backend creates an `Upload` row and returns a presigned `PUT` URL.
3. Client uploads the image directly to S3 or MinIO.
4. Client calls `POST /profile/avatar/uploads/:id/complete`.
5. Backend verifies the object in storage, promotes the `Upload` into a `File`, and attaches it to the user.
6. Client refreshes `GET /auth/me` or uses the complete response to display `avatarFile.link`.

## Data Model Usage

The avatar implementation uses the existing upload tracking tables:

- `Upload`: temporary upload intent and metadata.
- `File`: persisted uploaded file metadata after successful completion.
- `User.avatarFileId`: current avatar file for the user.

Important fields:

- `Upload.status`: starts as `UPLOADING`, changes to `UPLOADED` after successful completion.
- `File.sourceUploadId`: links the promoted file back to the upload and prevents duplicate promotion.
- `File.isClaimed`: set to `true` because the avatar file is immediately attached to a user.
- `File.link`: public URL used by clients to display the avatar.

Completing the same upload more than once is idempotent for promotion. If a `File` already exists for the upload, the existing file is reused and assigned to the user.

## Storage Configuration

Required:

```env
S3_BUCKET=product-catalogue
S3_PUBLIC_BASE_URL=http://localhost:9000/product-catalogue
```

Common development values for MinIO:

```env
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_FORCE_PATH_STYLE=true
AVATAR_MAX_BYTES=5242880
```

Production can use AWS S3 or any compatible object store. `S3_FORCE_PATH_STYLE` should usually be `false` or omitted for AWS S3, and `S3_PUBLIC_BASE_URL` should point at the public bucket URL or CDN base URL.

`File.link` values are plain public URLs. The bucket or CDN behind `S3_PUBLIC_BASE_URL` must allow browser reads for avatar object keys. In local MinIO, configure anonymous download access if direct avatar URLs return `AccessDenied`:

```bash
docker exec product-catalogue-minio mc anonymous set download local/product-catalogue
```

See `docs/storage-module.md` for the shared storage service behavior and MinIO setup details.

## Related Code

- `src/profile/profile.controller.ts`: HTTP endpoints.
- `src/profile/profile.service.ts`: profile updates, password verification, upload promotion.
- `src/profile/dto/*.ts`: request validation.
- `src/storage/storage.service.ts`: S3 client, presigned URL generation, object verification, public URL generation.
- `docs/storage-module.md`: shared storage module documentation.
- `src/users/users.service.ts`: safe user response shaping and avatar relation loading.
