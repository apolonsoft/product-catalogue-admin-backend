/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { createMockPrisma } from './mock-prisma';
import { Role, UserStatus, type User } from './../src/prisma/prisma-client';

describe('AuthController (e2e)', () => {
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
      phone: null,
      firstName: null,
      lastName: null,
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
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();

    httpApp = app.getHttpAdapter().getInstance() as App;
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /auth/login', () => {
    it('returns a JWT for the default admin', async () => {
      const response = await request(httpApp)
        .post('/auth/login')
        .send({ email: 'admin@example.com', password: 'Admin123!' })
        .expect(200);

      expect(response.body.accessToken).toBeDefined();
      expect(response.body.user).toHaveProperty('email', 'admin@example.com');
      expect(response.body.user).not.toHaveProperty('passwordHash');
    });

    it('fails with invalid credentials', async () => {
      await request(httpApp)
        .post('/auth/login')
        .send({ email: 'admin@example.com', password: 'wrong-pass' })
        .expect(401);
    });
  });

  describe('GET /auth/me', () => {
    it('returns the current user with a valid token', async () => {
      const login = await request(httpApp)
        .post('/auth/login')
        .send({ email: 'admin@example.com', password: 'Admin123!' });

      const response = await request(httpApp)
        .get('/auth/me')
        .set('Authorization', `Bearer ${login.body.accessToken as string}`)
        .expect(200);

      expect(response.body.email).toBe('admin@example.com');
    });

    it('fails without a token', async () => {
      await request(httpApp).get('/auth/me').expect(401);
    });
  });

  describe('POST /auth/invitations', () => {
    it('allows an admin to invite a user and the invite can be accepted', async () => {
      const adminLogin = await request(httpApp)
        .post('/auth/login')
        .send({ email: 'admin@example.com', password: 'Admin123!' });

      const inviteResponse = await request(httpApp)
        .post('/auth/invitations')
        .set('Authorization', `Bearer ${adminLogin.body.accessToken as string}`)
        .send({ email: 'invited@example.com', role: 'USER' })
        .expect(201);

      expect(inviteResponse.body.token).toBeDefined();
      expect(inviteResponse.body.link).toContain(
        inviteResponse.body.token as string,
      );

      await request(httpApp)
        .post('/auth/invitations/accept')
        .send({
          token: inviteResponse.body.token as string,
          password: 'Invited123!',
        })
        .expect(200);

      const userLogin = await request(httpApp)
        .post('/auth/login')
        .send({ email: 'invited@example.com', password: 'Invited123!' })
        .expect(200);

      expect(userLogin.body.accessToken).toBeDefined();
    });

    it('denies non-admin users', async () => {
      const adminLogin = await request(httpApp)
        .post('/auth/login')
        .send({ email: 'admin@example.com', password: 'Admin123!' });

      const inviteResponse = await request(httpApp)
        .post('/auth/invitations')
        .set('Authorization', `Bearer ${adminLogin.body.accessToken as string}`)
        .send({ email: 'regular@example.com', role: 'USER' })
        .expect(201);

      await request(httpApp)
        .post('/auth/invitations/accept')
        .send({
          token: inviteResponse.body.token as string,
          password: 'Regular123!',
        })
        .expect(200);

      const userLogin = await request(httpApp)
        .post('/auth/login')
        .send({ email: 'regular@example.com', password: 'Regular123!' })
        .expect(200);

      await request(httpApp)
        .post('/auth/invitations')
        .set('Authorization', `Bearer ${userLogin.body.accessToken as string}`)
        .send({ email: 'another@example.com', role: 'USER' })
        .expect(403);
    });
  });
});
