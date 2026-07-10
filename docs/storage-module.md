# Storage Module

The storage module provides S3-compatible object storage support for backend features that need direct file uploads and public file links. It currently powers profile avatar uploads through AWS SDK v3 and works with both AWS S3 and local MinIO.

## Module Responsibilities

`StorageModule` imports `ConfigModule`, provides `StorageService`, and exports it for other modules.

Consumers should use `StorageService` instead of constructing S3 clients directly. This keeps S3 configuration, presigned URL generation, public URL construction, and object verification in one place.

## Configuration

Required:

```env
S3_BUCKET=product-catalogue
S3_PUBLIC_BASE_URL=http://localhost:9000/product-catalogue
```

Common local MinIO values:

```env
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_FORCE_PATH_STYLE=true
```

Configuration behavior:

- `S3_BUCKET` is required for presigned uploads and object verification.
- `S3_PUBLIC_BASE_URL` is required when building public file links.
- `S3_REGION` defaults to `us-east-1`.
- `S3_ENDPOINT` is optional for AWS S3, but required for local MinIO or another S3-compatible service.
- `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` are used when both are present.
- `S3_FORCE_PATH_STYLE=true` should be used for MinIO.

For public browser access, the bucket or CDN behind `S3_PUBLIC_BASE_URL` must allow reads for the stored object keys. In local MinIO, the bucket can be made downloadable with:

```bash
docker exec product-catalogue-minio mc anonymous set download local/product-catalogue
```

## Service API

### `getPresignedPutUrl(key, type, size)`

Creates a presigned `PUT` URL for direct client uploads.

Behavior:

- Uses the configured `S3_BUCKET`.
- Signs a `PutObjectCommand` for the provided object key.
- Includes `ContentType` and `ContentLength` in the signed command.
- Returns a URL valid for 15 minutes.

Client uploads must use the same content type and file size that were used to request the signed URL.

Example:

```bash
curl -X PUT "$SIGNED_URL" \
  -H "Content-Type: image/png" \
  --data-binary "@avatar.png"
```

### `publicUrl(key)`

Builds the public URL stored in `File.link`.

```ts
publicUrl("users/user-id/avatar/file.png")
// http://localhost:9000/product-catalogue/users/user-id/avatar/file.png
```

This method only builds the URL string. It does not change bucket policy or guarantee that the object is publicly readable.

### `verifyObject(key, expectedType, expectedSize)`

Checks that an uploaded object exists and matches the expected metadata before it is promoted into a persisted `File`.

Behavior:

- Sends `HeadObject` to the configured bucket.
- Compares the stored object `ContentType` with `expectedType`.
- Compares the stored object `ContentLength` with `expectedSize`.
- Throws `BadRequestException` when metadata does not match.
- Throws `NotFoundException` when S3 reports `NotFound` or `NoSuchKey`.
- Re-throws other storage errors for the caller to handle.

## Avatar Upload Flow Usage

The profile module uses storage in this order:

1. Generate an object key for the avatar.
2. Call `getPresignedPutUrl` and return the signed URL to the client.
3. Let the client upload bytes directly to S3 or MinIO.
4. Call `verifyObject` when the client completes the upload.
5. Store `publicUrl(key)` as the promoted file link.

## Local MinIO Setup

The Docker Compose service starts MinIO with the bucket name from `S3_BUCKET`. The init script creates the bucket idempotently:

```sh
mc mb -p "local/${S3_BUCKET}"
```

If files need to be loaded directly by browser URL, also configure anonymous download access:

```sh
mc anonymous set download "local/${S3_BUCKET}"
```

Without this policy, direct GET requests to `S3_PUBLIC_BASE_URL` can return:

```xml
<Code>AccessDenied</Code>
```

## Related Code

- `src/storage/storage.module.ts`: NestJS module declaration and service export.
- `src/storage/storage.service.ts`: S3 client creation, presigned PUT URLs, public URL generation, and object verification.
- `src/profile/profile.service.ts`: current consumer for avatar upload initiation and completion.
- `platform/docker/minio/init.sh`: local bucket creation during MinIO startup.
