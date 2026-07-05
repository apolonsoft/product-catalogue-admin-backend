import dotenv from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma-seed/client.mts';

dotenv.config({ quiet: true });

/**
 * @type {import("../../generated/prisma-seed/client.mts").PrismaClient}
 */
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL ?? '',
});

export const prisma = new PrismaClient({ adapter });
