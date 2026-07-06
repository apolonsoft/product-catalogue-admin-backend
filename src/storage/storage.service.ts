import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  HeadObjectCommand,
  S3Client,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface PresignedUploadUrl {
  url: string;
}

@Injectable()
export class StorageService {
  private client: S3Client | undefined;

  constructor(private readonly config: ConfigService) {}

  private getS3Client(): S3Client {
    if (this.client) {
      return this.client;
    }

    const endpoint = this.config.get<string>('S3_ENDPOINT');
    const region = this.config.get<string>('S3_REGION', 'us-east-1');
    const accessKeyId = this.config.get<string>('S3_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('S3_SECRET_ACCESS_KEY');
    const forcePathStyle =
      this.config.get<string>('S3_FORCE_PATH_STYLE') === 'true';

    this.client = new S3Client({
      region,
      ...(endpoint ? { endpoint } : {}),
      forcePathStyle,
      credentials:
        accessKeyId && secretAccessKey
          ? { accessKeyId, secretAccessKey }
          : undefined,
    });

    return this.client;
  }

  async getPresignedPutUrl(
    key: string,
    type: string,
    size: number,
  ): Promise<PresignedUploadUrl> {
    const bucket = this.config.getOrThrow<string>('S3_BUCKET');

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: type,
      ContentLength: size,
    });

    const url = await getSignedUrl(this.getS3Client(), command, {
      expiresIn: 900, // 15 minutes
    });

    return { url };
  }

  publicUrl(key: string): string {
    const baseUrl = this.config.getOrThrow<string>('S3_PUBLIC_BASE_URL');
    return `${baseUrl}/${key}`;
  }

  async verifyObject(
    key: string,
    expectedType: string,
    expectedSize: number,
  ): Promise<void> {
    const bucket = this.config.getOrThrow<string>('S3_BUCKET');

    try {
      const response = await this.getS3Client().send(
        new HeadObjectCommand({ Bucket: bucket, Key: key }),
      );

      const actualType = response.ContentType ?? '';
      const actualSize = response.ContentLength ?? -1;

      if (actualType !== expectedType) {
        throw new BadRequestException(
          `Avatar content type mismatch: expected ${expectedType}, got ${actualType}`,
        );
      }

      if (actualSize !== expectedSize) {
        throw new BadRequestException(
          `Avatar size mismatch: expected ${expectedSize}, got ${actualSize}`,
        );
      }
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      const errorName =
        error && typeof error === 'object' && 'name' in error
          ? (error as { name: string }).name
          : '';

      if (errorName === 'NotFound' || errorName === 'NoSuchKey') {
        throw new NotFoundException('Avatar upload not found in storage');
      }

      throw error;
    }
  }
}
