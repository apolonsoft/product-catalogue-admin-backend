import { prisma } from '../context.js';
import bcrypt from 'bcrypt';
import { Role, UserStatus } from '../../../generated/prisma-seed/enums.mts';

const DEFAULT_SALT_ROUNDS = 10;
const saltRounds =
  Number(process.env.BCRYPT_SALT_ROUNDS) || DEFAULT_SALT_ROUNDS;

export async function hashPassword(password) {
  return await bcrypt.hash(password, saltRounds);
}

export async function seedDefaultAdminUser() {
  const adminEmail = process.env.DEFAULT_ADMIN_EMAIL;
  const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    console.log(
      'DEFAULT_ADMIN_EMAIL or DEFAULT_ADMIN_PASSWORD not set; skipping default admin seed.',
    );
    return;
  }

  const existing = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (existing) {
    console.log(`Default admin ${adminEmail} already exists; skipping seed.`);
    return;
  }

  const passwordHash = await hashPassword(adminPassword);

  await prisma.user.create({
    data: {
      email: adminEmail,
      passwordHash,
      role: Role.ADMIN,
      status: UserStatus.ACTIVE,
    },
  });

  console.log(`Created default admin ${adminEmail}.`);
}
