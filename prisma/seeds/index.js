import { seedUsers } from './functions/01_users.js';
import { prisma } from './context.js';
import ora from 'ora';
import chalk from 'chalk';

/**
 * @param {() => Promise<void>} seedFunction
 * @param {string} functionName
 * @param {...any} args
 */
async function seed(seedFunction, functionName, ...args) {
  const spinner = ora(`Seeding ${functionName}`).start();
  const result = await seedFunction(...args);
  spinner.succeed(chalk.green(`Seeded ${functionName}`));
  spinner.stop();
  return result;
}

async function main() {
  await prisma.$connect();
  console.log('🌱 Seeding database...');

  // 01 - Users
  await seed(seedUsers, 'users');

  console.log('✅ Done!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
