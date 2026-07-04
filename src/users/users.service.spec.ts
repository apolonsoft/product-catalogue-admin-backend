import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Role, UserStatus } from '../prisma/prisma-client';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

type AnyMock = jest.Mock<(...args: any[]) => any>;

describe('UsersService', () => {
  let service: UsersService;
  let prisma: {
    user: {
      findUnique: AnyMock;
      create: AnyMock;
      update: AnyMock;
    };
  };
  let config: { get: AnyMock };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    config = {
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('ensureDefaultAdmin', () => {
    it('creates a default admin when env vars are set and user does not exist', async () => {
      config.get
        .mockReturnValueOnce('admin@example.com')
        .mockReturnValueOnce('SecurePassword123!');
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({});

      await service.ensureDefaultAdmin();

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'admin@example.com' },
      });
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'admin@example.com',
            role: Role.ADMIN,
            status: UserStatus.ACTIVE,
          }),
        }),
      );
    });

    it('does not recreate the admin if it already exists', async () => {
      config.get
        .mockReturnValueOnce('admin@example.com')
        .mockReturnValueOnce('SecurePassword123!');
      prisma.user.findUnique.mockResolvedValue({
        id: '1',
        email: 'admin@example.com',
      });

      await service.ensureDefaultAdmin();

      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('does nothing when default admin env vars are missing', async () => {
      config.get.mockReturnValue(undefined);

      await service.ensureDefaultAdmin();

      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('hashPassword', () => {
    it('returns a bcrypt hash', async () => {
      const hash = await service.hashPassword('password');
      expect(hash).not.toBe('password');
      expect(hash).toContain('$2b$');
    });
  });
});
