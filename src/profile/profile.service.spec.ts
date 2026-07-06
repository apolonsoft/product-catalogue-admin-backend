import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { createMockPrisma } from '../../test/mock-prisma';
import {
  Role,
  UploadStatus,
  UserStatus,
  type User,
} from '../prisma/prisma-client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { UsersService } from '../users/users.service';
import { InitiateAvatarUploadDto } from './dto/initiate-avatar-upload.dto';
import { ProfileService } from './profile.service';

describe('ProfileService', () => {
  let service: ProfileService;
  let storage: {
    getPresignedPutUrl: jest.MockedFunction<
      StorageService['getPresignedPutUrl']
    >;
    publicUrl: jest.MockedFunction<StorageService['publicUrl']>;
    verifyObject: jest.MockedFunction<StorageService['verifyObject']>;
  };
  let prisma: ReturnType<typeof createMockPrisma>['prisma'];
  let stores: ReturnType<typeof createMockPrisma>['stores'];

  beforeEach(async () => {
    const { prisma: mockPrisma, stores: mockStores } = createMockPrisma();
    prisma = mockPrisma;
    stores = mockStores;

    storage = {
      getPresignedPutUrl: jest
        .fn<StorageService['getPresignedPutUrl']>()
        .mockResolvedValue({ url: 'https://s3.test/presigned' }),
      publicUrl: jest
        .fn<StorageService['publicUrl']>()
        .mockImplementation((key) => `https://cdn.test/${key}`),
      verifyObject: jest
        .fn<StorageService['verifyObject']>()
        .mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfileService,
        UsersService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: StorageService,
          useValue: storage,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, fallback?: unknown) => {
              const values: Record<string, unknown> = {
                AVATAR_MAX_BYTES: 5 * 1024 * 1024,
                S3_BUCKET: 'test-bucket',
                S3_REGION: 'us-east-1',
                BCRYPT_SALT_ROUNDS: 10,
              };
              return values[key] ?? fallback;
            }),
            getOrThrow: jest.fn((key: string) => {
              const values: Record<string, string> = {
                S3_BUCKET: 'test-bucket',
                S3_PUBLIC_BASE_URL: 'https://cdn.test',
              };
              if (!(key in values)) {
                throw new Error(`Missing config key: ${key}`);
              }
              return values[key];
            }),
          },
        },
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    service = module.get<ProfileService>(ProfileService);
  });

  function seedUser(password = 'OldPassword123!'): User {
    const passwordHash = bcrypt.hashSync(password, 10);
    const user: User = {
      id: 'user-1',
      email: 'user@example.com',
      passwordHash,
      role: Role.USER,
      status: UserStatus.ACTIVE,
      phone: null,
      firstName: 'John',
      lastName: 'Doe',
      avatarFileId: null,
      avatarFile: null,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as User;
    stores.users.push(user);
    return user;
  }

  describe('updateProfile', () => {
    it('updates first and last name without exposing passwordHash', async () => {
      seedUser();
      const result = await service.updateProfile('user-1', {
        firstName: 'Jane',
        lastName: 'Smith',
      });

      expect(result.firstName).toBe('Jane');
      expect(result.lastName).toBe('Smith');
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('accepts clearing nullable names', async () => {
      seedUser();
      const result = await service.updateProfile('user-1', {
        firstName: null,
        lastName: null,
      });

      expect(result.firstName).toBeNull();
      expect(result.lastName).toBeNull();
    });
  });

  describe('changePassword', () => {
    it('rejects password update when current password is wrong', async () => {
      seedUser('CorrectPassword123!');
      await expect(
        service.changePassword('user-1', {
          currentPassword: 'wrong-pass',
          newPassword: 'NewPassword123!',
        }),
      ).rejects.toThrow('Current password is incorrect');
    });

    it('hashes and stores new password when current password is correct', async () => {
      seedUser('CorrectPassword123!');
      await service.changePassword('user-1', {
        currentPassword: 'CorrectPassword123!',
        newPassword: 'NewPassword123!',
      });

      const updated = stores.users.find((u) => u.id === 'user-1');
      expect(updated).toBeDefined();
      expect(updated!.passwordHash).not.toBeNull();
      expect(
        bcrypt.compareSync('NewPassword123!', updated!.passwordHash!),
      ).toBe(true);
    });
  });

  describe('initiateAvatarUpload', () => {
    it('creates an Upload with S3 metadata and validates file type/size', async () => {
      seedUser();
      const dto: InitiateAvatarUploadDto = {
        name: 'avatar.png',
        type: 'image/png',
        size: 1024,
      };

      const result = await service.initiateAvatarUpload('user-1', dto);

      expect(result.uploadId).toBeDefined();
      expect(result.url).toBe('https://s3.test/presigned');
      expect(stores.uploads).toHaveLength(1);
      expect(stores.uploads[0]).toMatchObject({
        bucket: 'test-bucket',
        region: 'us-east-1',
        size: 1024,
        type: 'image/png',
        name: 'avatar.png',
        status: UploadStatus.UPLOADING,
      });
      expect(stores.uploads[0].key).toContain(`users/user-1/avatar/`);
    });

    it('rejects avatars that exceed the size limit', async () => {
      seedUser();
      await expect(
        service.initiateAvatarUpload('user-1', {
          name: 'huge.png',
          type: 'image/png',
          size: 10 * 1024 * 1024,
        }),
      ).rejects.toThrow();
    });

    it('rejects non-image file types', async () => {
      seedUser();
      await expect(
        service.initiateAvatarUpload('user-1', {
          name: 'doc.pdf',
          type: 'application/pdf',
          size: 1024,
        }),
      ).rejects.toThrow();
    });
  });

  describe('completeAvatarUpload', () => {
    it('finalizes avatar upload into a claimed File and updates avatarFileId', async () => {
      seedUser();
      const init = await service.initiateAvatarUpload('user-1', {
        name: 'avatar.png',
        type: 'image/png',
        size: 1024,
      });

      const result = await service.completeAvatarUpload(
        'user-1',
        init.uploadId,
      );

      expect(stores.files).toHaveLength(1);
      expect(stores.files[0].isClaimed).toBe(true);
      expect(stores.files[0].sourceUploadId).toBe(init.uploadId);
      expect(result.avatarFileId).toBe(stores.files[0].id);
      expect(result.avatarFile).toBeDefined();
      expect(result.avatarFile?.link).toBe(
        `https://cdn.test/${stores.files[0].key}`,
      );
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('is idempotent for the same Upload', async () => {
      seedUser();
      const init = await service.initiateAvatarUpload('user-1', {
        name: 'avatar.png',
        type: 'image/png',
        size: 1024,
      });

      const first = await service.completeAvatarUpload('user-1', init.uploadId);
      const second = await service.completeAvatarUpload(
        'user-1',
        init.uploadId,
      );

      expect(stores.files).toHaveLength(1);
      expect(first.avatarFileId).toBe(second.avatarFileId);
    });

    it('does not promote the upload when the S3 object is missing', async () => {
      seedUser();
      const init = await service.initiateAvatarUpload('user-1', {
        name: 'avatar.png',
        type: 'image/png',
        size: 1024,
      });

      storage.verifyObject.mockRejectedValue(
        new Error('Avatar upload not found in storage'),
      );

      await expect(
        service.completeAvatarUpload('user-1', init.uploadId),
      ).rejects.toThrow('Avatar upload not found in storage');

      expect(stores.files).toHaveLength(0);
    });

    it('does not promote the upload when the stored metadata does not match', async () => {
      seedUser();
      const init = await service.initiateAvatarUpload('user-1', {
        name: 'avatar.png',
        type: 'image/png',
        size: 1024,
      });

      storage.verifyObject.mockRejectedValue(
        new Error('Avatar content type mismatch'),
      );

      await expect(
        service.completeAvatarUpload('user-1', init.uploadId),
      ).rejects.toThrow('Avatar content type mismatch');

      expect(stores.files).toHaveLength(0);
    });
  });
});
