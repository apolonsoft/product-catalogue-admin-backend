/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { StorageService } from './../src/storage/storage.service';
import { createMockPrisma } from './mock-prisma';
import { Role, UserStatus, type User } from './../src/prisma/prisma-client';

describe('ProfileController (e2e)', () => {
  let app: INestApplication<App>;
  let httpApp: App;

  beforeEach(async () => {
    const passwordHash = await bcrypt.hash('Admin123!', 10);
    const adminUser: User = {
      id: 'admin-1',
      email: 'admin@example.com',
      passwordHash,
      role: Role.ADMIN,
      status: UserStatus.ACTIVE,
      tokenVersion: 0,
      phone: null,
      firstName: 'Admin',
      lastName: 'User',
      avatarFileId: null,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const { prisma } = createMockPrisma([adminUser]);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(StorageService)
      .useValue({
        getPresignedPutUrl: jest
          .fn()
          .mockResolvedValue({ url: 'https://s3.test/presigned' }),
        publicUrl: jest.fn((key: string) => `https://cdn.test/${key}`),
        verifyObject: jest.fn().mockResolvedValue(undefined),
      })
      .overrideProvider(ConfigService)
      .useValue({
        get: jest.fn((key: string, fallback?: unknown) => {
          const values: Record<string, unknown> = {
            JWT_SECRET: 'test-jwt-secret',
            JWT_EXPIRES_IN: '1h',
            BCRYPT_SALT_ROUNDS: 10,
            S3_BUCKET: 'test-bucket',
            S3_REGION: 'us-east-1',
            S3_PUBLIC_BASE_URL: 'https://cdn.test',
            AVATAR_MAX_BYTES: 5 * 1024 * 1024,
            INVITE_EXPIRES_IN_DAYS: 7,
            APP_URL: 'http://localhost:3000',
          };
          return values[key] ?? fallback;
        }),
        getOrThrow: jest.fn((key: string) => {
          const values: Record<string, string> = {
            JWT_SECRET: 'test-jwt-secret',
            DATABASE_URL: 'postgresql://localhost:5432/product-catalogue',
            S3_BUCKET: 'test-bucket',
            S3_PUBLIC_BASE_URL: 'https://cdn.test',
          };
          if (!(key in values)) {
            throw new Error(`Missing config key: ${key}`);
          }
          return values[key];
        }),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();

    httpApp = app.getHttpAdapter().getInstance() as App;
  });

  afterEach(async () => {
    await app.close();
  });

  async function login(): Promise<string> {
    const response = await request(httpApp)
      .post('/auth/login')
      .send({ email: 'admin@example.com', password: 'Admin123!' })
      .expect(200);
    return response.body.accessToken as string;
  }

  describe('authentication', () => {
    it('rejects unauthenticated requests', async () => {
      await request(httpApp).patch('/profile').send({}).expect(401);
      await request(httpApp).patch('/profile/password').send({}).expect(401);
      await request(httpApp)
        .post('/profile/avatar/uploads')
        .send({})
        .expect(401);
      await request(httpApp)
        .post('/profile/avatar/uploads/uuid/complete')
        .send()
        .expect(401);
    });
  });

  describe('PATCH /profile', () => {
    it('updates names and returns the safe current user', async () => {
      const token = await login();
      const response = await request(httpApp)
        .patch('/profile')
        .set('Authorization', `Bearer ${token}`)
        .send({ firstName: 'Updated', lastName: 'Name' })
        .expect(200);

      expect(response.body.firstName).toBe('Updated');
      expect(response.body.lastName).toBe('Name');
      expect(response.body).not.toHaveProperty('passwordHash');
    });
  });

  describe('PATCH /profile/password', () => {
    it('returns 204 when the current password is correct', async () => {
      const token = await login();
      await request(httpApp)
        .patch('/profile/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'Admin123!', newPassword: 'NewPass123!' })
        .expect(204);
    });

    it('returns 401 when the current password is wrong', async () => {
      const token = await login();
      await request(httpApp)
        .patch('/profile/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'wrong-pass', newPassword: 'NewPass123!' })
        .expect(401);
    });
  });

  describe('avatar upload flow', () => {
    it('initiates and finalizes an avatar upload', async () => {
      const token = await login();
      const init = await request(httpApp)
        .post('/profile/avatar/uploads')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'avatar.png', type: 'image/png', size: 1024 })
        .expect(201);

      expect(init.body.uploadId).toBeDefined();
      expect(init.body.url).toBe('https://s3.test/presigned');

      const complete = await request(httpApp)
        .post(
          `/profile/avatar/uploads/${init.body.uploadId as string}/complete`,
        )
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(complete.body.avatarFileId).toBeDefined();
      expect(complete.body.avatarFile).toBeDefined();
      expect(complete.body.avatarFile.link).toContain('https://cdn.test/');
    });

    it('GET /auth/me includes avatar data after finalize', async () => {
      const token = await login();
      const init = await request(httpApp)
        .post('/profile/avatar/uploads')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'avatar.png', type: 'image/png', size: 1024 })
        .expect(201);

      await request(httpApp)
        .post(
          `/profile/avatar/uploads/${init.body.uploadId as string}/complete`,
        )
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const me = await request(httpApp)
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(me.body.avatarFileId).toBeDefined();
      expect(me.body.avatarFile).toBeDefined();
    });
  });
});
