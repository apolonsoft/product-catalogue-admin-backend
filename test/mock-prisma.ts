import { jest } from '@jest/globals';
import { Role, UserStatus } from '../generated/prisma/enums';
import type {
  UserModel as User,
  UserInvitationModel as UserInvitation,
} from '../generated/prisma/models';
import { PrismaService } from '../src/prisma/prisma.service';

export interface MockPrismaStores {
  users: User[];
  invitations: UserInvitation[];
}

export function createMockPrisma(initialUsers: User[] = []): {
  prisma: jest.Mocked<Partial<PrismaService>>;
  stores: MockPrismaStores;
} {
  const stores: MockPrismaStores = {
    users: [...initialUsers],
    invitations: [],
  };

  const prisma = {
    $connect: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    $disconnect: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    user: {
      findUnique: jest.fn(
        ({ where }: { where: { id?: string; email?: string } }) => {
          if (where.id) {
            return Promise.resolve(
              stores.users.find((u) => u.id === where.id) ?? null,
            );
          }
          if (where.email) {
            return Promise.resolve(
              stores.users.find((u) => u.email === where.email) ?? null,
            );
          }
          return Promise.resolve(null);
        },
      ),
      create: jest.fn(
        ({ data }: { data: Omit<User, 'createdAt' | 'updatedAt'> }) => {
          const user: User = {
            ...data,
            id: data.id ?? `user-${stores.users.length + 1}`,
            role: data.role ?? Role.USER,
            status: data.status ?? UserStatus.PENDING,
            passwordHash: data.passwordHash ?? null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          stores.users.push(user);
          return Promise.resolve(user);
        },
      ),
      update: jest.fn(
        ({
          where,
          data,
          omit,
        }: {
          where: { id: string };
          data: Partial<User>;
          omit?: { passwordHash?: boolean };
        }) => {
          const index = stores.users.findIndex((u) => u.id === where.id);
          if (index === -1) {
            return Promise.reject(new Error('User not found'));
          }
          stores.users[index] = {
            ...stores.users[index],
            ...data,
            updatedAt: new Date(),
          };
          const result = { ...stores.users[index] };
          if (omit?.passwordHash) {
            delete (result as Partial<User>).passwordHash;
          }
          return Promise.resolve(result);
        },
      ),
    },
    userInvitation: {
      create: jest.fn(
        ({
          data,
        }: {
          data: Omit<UserInvitation, 'id' | 'createdAt' | 'updatedAt'>;
        }) => {
          const invitation: UserInvitation = {
            ...data,
            id: `invite-${stores.invitations.length + 1}`,
            acceptedAt: data.acceptedAt ?? null,
            createdByUserId: data.createdByUserId ?? null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          stores.invitations.push(invitation);
          return Promise.resolve(invitation);
        },
      ),
      findUnique: jest.fn(
        ({
          where,
          include,
        }: {
          where: { tokenHash: string };
          include?: { user?: boolean };
        }) => {
          const invitation =
            stores.invitations.find((i) => i.tokenHash === where.tokenHash) ??
            null;
          if (!invitation || !include?.user) {
            return Promise.resolve(invitation);
          }
          const user = stores.users.find((u) => u.id === invitation.userId);
          return Promise.resolve({ ...invitation, user });
        },
      ),
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<UserInvitation>;
        }) => {
          const index = stores.invitations.findIndex((i) => i.id === where.id);
          if (index === -1) {
            return Promise.reject(new Error('Invitation not found'));
          }
          stores.invitations[index] = {
            ...stores.invitations[index],
            ...data,
            updatedAt: new Date(),
          };
          return Promise.resolve(stores.invitations[index]);
        },
      ),
    },
  } as unknown as jest.Mocked<Partial<PrismaService>>;

  return { prisma, stores };
}
