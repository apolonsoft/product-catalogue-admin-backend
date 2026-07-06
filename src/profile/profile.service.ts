import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { FileStatus, UploadStatus } from '../prisma/prisma-client';
import { StorageService } from '../storage/storage.service';
import { UsersService, type SafeUser } from '../users/users.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import {
  ALLOWED_AVATAR_TYPES,
  InitiateAvatarUploadDto,
} from './dto/initiate-avatar-upload.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

const DEFAULT_AVATAR_MAX_BYTES = 5 * 1024 * 1024;

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_{2,}/g, '_') || 'file';
}

@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
  ) {}

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<SafeUser> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
      },
      include: { avatarFile: true },
    });

    return this.usersService.stripPassword(user);
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const matches = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );

    if (!matches) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const passwordHash = await this.usersService.hashPassword(dto.newPassword);

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
  }

  async initiateAvatarUpload(
    userId: string,
    dto: InitiateAvatarUploadDto,
  ): Promise<{ uploadId: string; url: string }> {
    const maxBytes = Number(
      this.config.get<number>('AVATAR_MAX_BYTES', DEFAULT_AVATAR_MAX_BYTES),
    );

    if (dto.size > maxBytes) {
      throw new BadRequestException(
        `Avatar must be ${maxBytes} bytes or smaller`,
      );
    }

    if (
      !ALLOWED_AVATAR_TYPES.includes(
        dto.type as (typeof ALLOWED_AVATAR_TYPES)[number],
      )
    ) {
      throw new BadRequestException(
        `Avatar type must be one of: ${ALLOWED_AVATAR_TYPES.join(', ')}`,
      );
    }

    const uploadId = randomUUID();
    const safeName = safeFileName(dto.name);
    const key = `users/${userId}/avatar/${uploadId}-${safeName}`;

    const bucket = this.config.getOrThrow<string>('S3_BUCKET');
    const region = this.config.get<string>('S3_REGION', 'us-east-1');

    await this.prisma.upload.create({
      data: {
        id: uploadId,
        bucket,
        region,
        key,
        link: '',
        size: dto.size,
        type: dto.type,
        name: dto.name,
        hash: dto.hash ?? null,
        status: UploadStatus.UPLOADING,
      },
    });

    const { url } = await this.storage.getPresignedPutUrl(
      key,
      dto.type,
      dto.size,
    );

    return { uploadId, url };
  }

  async completeAvatarUpload(
    userId: string,
    uploadId: string,
  ): Promise<SafeUser> {
    const upload = await this.prisma.upload.findUnique({
      where: { id: uploadId },
      include: { promotedFile: true },
    });

    if (!upload) {
      throw new NotFoundException('Upload not found');
    }

    const keyUserId = upload.key.split('/')[1];

    if (keyUserId !== userId) {
      throw new NotFoundException('Upload not found');
    }

    if (upload.status === UploadStatus.FAILED) {
      throw new BadRequestException('Upload has failed');
    }

    await this.storage.verifyObject(upload.key, upload.type, upload.size);

    let file = upload.promotedFile;

    if (!file) {
      file = await this.prisma.file.create({
        data: {
          bucket: upload.bucket,
          region: upload.region,
          key: upload.key,
          link: this.storage.publicUrl(upload.key),
          size: upload.size,
          type: upload.type,
          name: upload.name,
          hash: upload.hash,
          status: FileStatus.UPLOADED,
          isClaimed: true,
          sourceUploadId: upload.id,
        },
      });

      await this.prisma.upload.update({
        where: { id: upload.id },
        data: { status: UploadStatus.UPLOADED },
      });
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarFileId: file.id },
      include: { avatarFile: true },
    });

    return this.usersService.stripPassword(user);
  }
}
