import { jest } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import {
  UploadStatus,
  type File,
  type PasswordResetToken,
  type Upload,
  type User,
  type UserInvitation,
} from '../src/prisma/prisma-client';
import { PrismaService } from '../src/prisma/prisma.service';
import { Role, UserStatus } from '../src/prisma/prisma-client';

type MockUser = User & { avatarFile?: File | null };
type MockUpload = Upload & { promotedFile?: File | null };

export interface MockPrismaStores {
  users: MockUser[];
  invitations: UserInvitation[];
  passwordResetTokens: PasswordResetToken[];
  files: File[];
  uploads: MockUpload[];
}

export function createMockPrisma(initialUsers: User[] = []): {
  prisma: jest.Mocked<Partial<PrismaService>>;
  stores: MockPrismaStores;
} {
  const stores: MockPrismaStores = {
    users: initialUsers.map((u) => ({ ...u, avatarFile: null })),
    invitations: [],
    passwordResetTokens: [],
    files: [],
    uploads: [],
  };

  const resolveAvatarFile = (user: MockUser): MockUser => {
    if (!user.avatarFileId) {
      return { ...user, avatarFile: null };
    }
    const file = stores.files.find((f) => f.id === user.avatarFileId) ?? null;
    return { ...user, avatarFile: file };
  };

  const prisma = {
    $connect: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    $disconnect: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    $transaction: jest.fn(<T>(ops: Promise<T>[]) => Promise.all(ops)),
    user: {
      findUnique: jest.fn(
        ({
          where,
          include,
        }: {
          where: { id?: string; email?: string };
          include?: { avatarFile?: boolean };
        }) => {
          let user: MockUser | null = null;
          if (where.id) {
            user = stores.users.find((u) => u.id === where.id) ?? null;
          } else if (where.email) {
            user = stores.users.find((u) => u.email === where.email) ?? null;
          }

          if (!user) {
            return Promise.resolve(null);
          }

          const result = include?.avatarFile
            ? resolveAvatarFile(user)
            : { ...user };
          return Promise.resolve(result as User);
        },
      ),
      create: jest.fn(
        ({ data }: { data: Omit<User, 'createdAt' | 'updatedAt'> }) => {
          const user: MockUser = {
            ...(data as User),
            id: data.id ?? `user-${stores.users.length + 1}`,
            role: data.role ?? Role.USER,
            status: data.status ?? UserStatus.PENDING,
            passwordHash: data.passwordHash ?? null,
            tokenVersion: data.tokenVersion ?? 0,
            avatarFileId: data.avatarFileId ?? null,
            avatarFile: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          stores.users.push(user);
          return Promise.resolve(user as User);
        },
      ),
      update: jest.fn(
        ({
          where,
          data,
          include,
          omit,
        }: {
          where: { id: string };
          data: Partial<User> & {
            tokenVersion?: { increment: number } | number;
          };
          include?: { avatarFile?: boolean };
          omit?: { passwordHash?: boolean };
        }) => {
          const index = stores.users.findIndex((u) => u.id === where.id);
          if (index === -1) {
            return Promise.reject(new Error('User not found'));
          }

          const current = stores.users[index];
          let nextTokenVersion = current.tokenVersion;
          if (
            typeof data.tokenVersion === 'object' &&
            data.tokenVersion !== null &&
            'increment' in data.tokenVersion
          ) {
            nextTokenVersion =
              current.tokenVersion +
              (data.tokenVersion as { increment: number }).increment;
          } else if (typeof data.tokenVersion === 'number') {
            nextTokenVersion = data.tokenVersion;
          }

          stores.users[index] = {
            ...current,
            ...(data as Partial<MockUser>),
            tokenVersion: nextTokenVersion,
            avatarFileId:
              data.avatarFileId !== undefined
                ? data.avatarFileId
                : current.avatarFileId,
            updatedAt: new Date(),
          };

          let result: MockUser = { ...stores.users[index] };
          if (include?.avatarFile) {
            result = resolveAvatarFile(result);
          }
          if (omit?.passwordHash) {
            delete (result as Partial<User>).passwordHash;
          }
          return Promise.resolve(result as User);
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
    passwordResetToken: {
      create: jest.fn(
        ({
          data,
        }: {
          data: Omit<
            PasswordResetToken,
            'id' | 'createdAt' | 'updatedAt' | 'consumedAt'
          > & { consumedAt?: Date | null };
        }) => {
          const token: PasswordResetToken = {
            ...data,
            id: `reset-${stores.passwordResetTokens.length + 1}`,
            consumedAt: data.consumedAt ?? null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          stores.passwordResetTokens.push(token);
          return Promise.resolve(token);
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
          const token =
            stores.passwordResetTokens.find(
              (t) => t.tokenHash === where.tokenHash,
            ) ?? null;
          if (!token || !include?.user) {
            return Promise.resolve(token);
          }
          const user = stores.users.find((u) => u.id === token.userId);
          return Promise.resolve({ ...token, user });
        },
      ),
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<PasswordResetToken>;
        }) => {
          const index = stores.passwordResetTokens.findIndex(
            (t) => t.id === where.id,
          );
          if (index === -1) {
            return Promise.reject(new Error('Password reset token not found'));
          }
          stores.passwordResetTokens[index] = {
            ...stores.passwordResetTokens[index],
            ...data,
            updatedAt: new Date(),
          };
          return Promise.resolve(stores.passwordResetTokens[index]);
        },
      ),
    },
    upload: {
      create: jest.fn(({ data }: { data: Upload }) => {
        const upload: MockUpload = {
          ...data,
          link: data.link ?? '',
          hash: data.hash ?? null,
          error: null,
          uploadId: data.uploadId ?? null,
          status: data.status ?? UploadStatus.UPLOADING,
          createdAt: new Date(),
          updatedAt: new Date(),
          version: 1,
          promotedFile: null,
        };
        stores.uploads.push(upload);
        return Promise.resolve(upload as Upload);
      }),
      findUnique: jest.fn(
        ({
          where,
          include,
        }: {
          where: { id: string };
          include?: { promotedFile?: boolean };
        }) => {
          const upload = stores.uploads.find((u) => u.id === where.id) ?? null;
          if (!upload) {
            return Promise.resolve(null);
          }
          if (!include?.promotedFile) {
            return Promise.resolve(upload as Upload);
          }
          const file =
            stores.files.find((f) => f.sourceUploadId === upload.id) ?? null;
          return Promise.resolve({ ...upload, promotedFile: file } as Upload);
        },
      ),
      update: jest.fn(
        ({ where, data }: { where: { id: string }; data: Partial<Upload> }) => {
          const index = stores.uploads.findIndex((u) => u.id === where.id);
          if (index === -1) {
            return Promise.reject(new Error('Upload not found'));
          }
          stores.uploads[index] = {
            ...stores.uploads[index],
            ...data,
            updatedAt: new Date(),
          };
          return Promise.resolve(stores.uploads[index] as Upload);
        },
      ),
    },
    file: {
      create: jest.fn(
        ({
          data,
        }: {
          data: Omit<File, 'id' | 'createdAt' | 'updatedAt' | 'version'>;
        }) => {
          const file: File = {
            ...(data as File),
            id: randomUUID(),
            properties: null,
            error: null,
            uploadId: data.uploadId ?? null,
            deletedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            version: 1,
          };
          stores.files.push(file);
          return Promise.resolve(file);
        },
      ),
      findUnique: jest.fn(({ where }: { where: { id?: string } }) => {
        return Promise.resolve(
          stores.files.find((f) => f.id === where.id) ?? null,
        );
      }),
    },
  } as unknown as jest.Mocked<Partial<PrismaService>>;

  return { prisma, stores };
}
