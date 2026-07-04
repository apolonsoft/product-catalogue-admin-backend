import dotenv from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from '@prisma/client';

dotenv.config({ quiet: true });
``
/**
 * @type {import("../generated/index.ts").PrismaClient}
 */
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL ?? "",
});

export const prisma = new PrismaClient({ adapter });