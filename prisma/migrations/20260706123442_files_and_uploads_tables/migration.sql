-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('UPLOADING', 'PROCESSING', 'UPLOADED', 'FAILED');

-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('UPLOADING', 'UPLOADED', 'FAILED');

-- CreateTable
CREATE TABLE "files" (
    "id" UUID NOT NULL,
    "bucket" VARCHAR(255) NOT NULL,
    "region" VARCHAR(50) NOT NULL,
    "key" VARCHAR(1024) NOT NULL,
    "link" VARCHAR(2048) NOT NULL,
    "size" INTEGER NOT NULL,
    "type" VARCHAR(255) NOT NULL,
    "name" VARCHAR(512) NOT NULL,
    "hash" VARCHAR(128),
    "properties" JSON,
    "status" "FileStatus" NOT NULL DEFAULT 'UPLOADING',
    "error" TEXT,
    "is_claimed" BOOLEAN NOT NULL DEFAULT false,
    "upload_id" VARCHAR(255),
    "source_upload_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uploads" (
    "id" UUID NOT NULL,
    "bucket" VARCHAR(255) NOT NULL,
    "region" VARCHAR(50) NOT NULL,
    "key" VARCHAR(1024) NOT NULL,
    "link" VARCHAR(2048) NOT NULL DEFAULT '',
    "size" INTEGER NOT NULL,
    "type" VARCHAR(255) NOT NULL,
    "name" VARCHAR(512) NOT NULL,
    "hash" VARCHAR(128),
    "status" "UploadStatus" NOT NULL DEFAULT 'UPLOADING',
    "error" TEXT,
    "upload_id" VARCHAR(255),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "uploads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "files_source_upload_id_key" ON "files"("source_upload_id");

-- CreateIndex
CREATE INDEX "files_deleted_at_idx" ON "files"("deleted_at");

-- CreateIndex
CREATE INDEX "uploads_created_at_idx" ON "uploads"("created_at" DESC);

-- CreateIndex
CREATE INDEX "uploads_status_created_at_idx" ON "uploads"("status", "created_at");

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_source_upload_id_fkey" FOREIGN KEY ("source_upload_id") REFERENCES "uploads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
