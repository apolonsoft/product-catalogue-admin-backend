/* eslint-disable @typescript-eslint/no-unsafe-assignment,
                  @typescript-eslint/no-unsafe-member-access,
                  @typescript-eslint/no-unsafe-return */
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as bcrypt from 'bcrypt';
import { Role, UserStatus, type User } from '../prisma/prisma-client';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

type AnyMock = jest.Mock<(...args: any[]) => any>;

describe('AuthService', () => {
  let service: AuthService;
  let usersService: {
    findByEmail: AnyMock;
    findById: AnyMock;
    createInviteUser: AnyMock;
    activateUser: AnyMock;
    stripPassword: AnyMock;
  };
  let jwtService: { sign: AnyMock };
  let prisma: {
    userInvitation: {
      create: AnyMock;
      findUnique: AnyMock;
      update: AnyMock;
    };
  };
  let config: { get: AnyMock; getOrThrow: AnyMock };

  const activeUser: User = {
    id: 'user-1',
    email: 'active@example.com',
    passwordHash: '',
    role: Role.USER,
    status: UserStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    usersService = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      createInviteUser: jest.fn(),
      activateUser: jest.fn(),
      stripPassword: jest.fn((u) => {
        const safe = { ...u };
        delete safe.passwordHash;
        return safe;
      }),
    };

    jwtService = { sign: jest.fn(() => 'signed-token') };

    prisma = {
      userInvitation: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    config = {
      get: jest.fn(),
      getOrThrow: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('login', () => {
    it('succeeds with active user and valid password', async () => {
      activeUser.passwordHash = await bcrypt.hash('password', 10);
      usersService.findByEmail.mockResolvedValue(activeUser);
      config.getOrThrow.mockReturnValue('secret');

      const result = await service.login('active@example.com', 'password');

      expect(result.accessToken).toBe('signed-token');
      expect(result.user).not.toHaveProperty('passwordHash');
    });

    it('fails for invalid password', async () => {
      activeUser.passwordHash = await bcrypt.hash('password', 10);
      usersService.findByEmail.mockResolvedValue(activeUser);

      await expect(
        service.login('active@example.com', 'wrong'),
      ).rejects.toThrow('Invalid credentials');
    });

    it('fails for missing user', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        service.login('missing@example.com', 'password'),
      ).rejects.toThrow('Invalid credentials');
    });

    it('fails for pending user', async () => {
      usersService.findByEmail.mockResolvedValue({
        ...activeUser,
        status: UserStatus.PENDING,
      });

      await expect(
        service.login('pending@example.com', 'password'),
      ).rejects.toThrow('Account is pending activation');
    });

    it('fails for disabled user', async () => {
      usersService.findByEmail.mockResolvedValue({
        ...activeUser,
        status: UserStatus.DISABLED,
      });

      await expect(
        service.login('disabled@example.com', 'password'),
      ).rejects.toThrow('Account is disabled');
    });
  });

  describe('createInvitation', () => {
    it('creates a pending user and invitation', async () => {
      const email = 'invite@example.com';
      usersService.findByEmail.mockResolvedValue(null);
      usersService.createInviteUser.mockResolvedValue({
        id: 'invited-user',
        email,
        status: UserStatus.PENDING,
      });
      prisma.userInvitation.create.mockResolvedValue({
        id: 'invite-1',
        expiresAt: new Date(),
      });
      config.get.mockImplementation((key: string, defaultValue?: unknown) => {
        if (key === 'INVITE_EXPIRES_IN_DAYS') return 7;
        if (key === 'APP_URL') return 'http://localhost:3000';
        return defaultValue;
      });

      const result = await service.createInvitation(
        'admin-1',
        email,
        Role.USER,
      );

      expect(usersService.createInviteUser).toHaveBeenCalledWith(
        email,
        Role.USER,
      );
      expect(result.token).toBeDefined();
      expect(result.link).toContain(result.token);
    });

    it('throws when email already exists', async () => {
      usersService.findByEmail.mockResolvedValue(activeUser);

      await expect(
        service.createInvitation('admin-1', 'active@example.com', Role.USER),
      ).rejects.toThrow('A user with this email already exists');
    });
  });

  describe('acceptInvitation', () => {
    const token = 'abc123';

    it('activates user, hashes password, and marks invitation accepted', async () => {
      const invitedUser = {
        id: 'invited-user',
        email: 'invite@example.com',
        status: UserStatus.PENDING,
      } as User;
      prisma.userInvitation.findUnique.mockResolvedValue({
        id: 'invite-1',
        tokenHash: '',
        expiresAt: new Date(Date.now() + 86400000),
        acceptedAt: null,
        user: invitedUser,
        userId: invitedUser.id,
      });
      usersService.activateUser.mockResolvedValue({
        ...invitedUser,
        status: UserStatus.ACTIVE,
      });

      await service.acceptInvitation(token, 'NewPassword123!');

      expect(usersService.activateUser).toHaveBeenCalledWith(
        invitedUser.id,
        'NewPassword123!',
      );
      expect(prisma.userInvitation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'invite-1' },
          data: expect.objectContaining({ acceptedAt: expect.any(Date) }),
        }),
      );
    });

    it('rejects invalid token', async () => {
      prisma.userInvitation.findUnique.mockResolvedValue(null);

      await expect(service.acceptInvitation(token, 'password')).rejects.toThrow(
        'Invalid invitation token',
      );
    });

    it('rejects reused invitation', async () => {
      prisma.userInvitation.findUnique.mockResolvedValue({
        id: 'invite-1',
        acceptedAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
        user: { status: UserStatus.PENDING },
      });

      await expect(service.acceptInvitation(token, 'password')).rejects.toThrow(
        'Invitation has already been used',
      );
    });

    it('rejects expired invitation', async () => {
      prisma.userInvitation.findUnique.mockResolvedValue({
        id: 'invite-1',
        acceptedAt: null,
        expiresAt: new Date(Date.now() - 86400000),
        user: { status: UserStatus.PENDING },
      });

      await expect(service.acceptInvitation(token, 'password')).rejects.toThrow(
        'Invitation has expired',
      );
    });

    it('rejects disabled user', async () => {
      prisma.userInvitation.findUnique.mockResolvedValue({
        id: 'invite-1',
        acceptedAt: null,
        expiresAt: new Date(Date.now() + 86400000),
        user: { status: UserStatus.DISABLED },
      });

      await expect(service.acceptInvitation(token, 'password')).rejects.toThrow(
        'User account is disabled',
      );
    });
  });
});
