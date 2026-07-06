-- AlterTable
ALTER TABLE "users" ADD COLUMN "avatar_file_id" UUID;

-- CreateIndex
CREATE INDEX "users_avatar_file_id_idx" ON "users"("avatar_file_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_avatar_file_id_fkey" FOREIGN KEY ("avatar_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
