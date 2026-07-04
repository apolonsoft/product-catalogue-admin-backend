import { prisma } from '../context.js';
import bcrypt from 'bcrypt';
import userData from '../data/01_users.json' with { type: 'json' };

const DEFAULT_SALT_ROUNDS = 10;
const saltRounds =
  Number(process.env.BCRYPT_SALT_ROUNDS) || DEFAULT_SALT_ROUNDS;

/**
 * @param {string} password
 * @returns {Promise<Buffer>}
 */
export async function hashPassword(password) {
  return await bcrypt.hash(password, saltRounds);
}

/**
 * @returns {Promise<import("../../generated/index.ts").User[]>}
 */
export async function seedUsers() {
  const hashedPassword = await hashPassword('password');

  return Promise.all(
    userData.map((user) =>
      prisma.user.upsert({
        create: {
          id: user.id,
          email: user.email,
          phoneNumber: user.phoneNumber,
          passwordHash: hashedPassword,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          status: user.status,
          createdAt: new Date(user.createdAt),
          updatedAt: new Date(user.updatedAt),
        },
        update: {},
        where: {
          email: user.email,
        },
      }),
    ),
  );
}
