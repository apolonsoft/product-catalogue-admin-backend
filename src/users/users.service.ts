/* eslint-disable @typescript-eslint/no-unsafe-assignment,
                  @typescript-eslint/no-unsafe-member-access,
                  @typescript-eslint/no-unsafe-return,
                  @typescript-eslint/no-redundant-type-constituents */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { Role, UserStatus, type User } from '../prisma/prisma-client';
import { PrismaService } from '../prisma/prisma.service';

export type SafeUser = Omit<User, 'passwordHash'>;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private readonly saltRounds = 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async ensureDefaultAdmin(): Promise<void> {
    const adminEmail = this.config.get<string>('DEFAULT_ADMIN_EMAIL');
    const adminPassword = this.config.get<string>('DEFAULT_ADMIN_PASSWORD');

    if (!adminEmail || !adminPassword) {
      this.logger.log(
        'DEFAULT_ADMIN_EMAIL or DEFAULT_ADMIN_PASSWORD not set; skipping default admin seed.',
      );
      return;
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: adminEmail },
    });

    if (existing) {
      this.logger.log(
        `Default admin ${adminEmail} already exists; skipping seed.`,
      );
      return;
    }

    const passwordHash = await this.hashPassword(adminPassword);

    await this.prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash,
        role: Role.ADMIN,
        status: UserStatus.ACTIVE,
      },
    });

    this.logger.log(`Created default admin ${adminEmail}.`);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async createInviteUser(email: string, role: Role): Promise<User> {
    return this.prisma.user.create({
      data: {
        email,
        role,
        status: UserStatus.PENDING,
      },
    });
  }

  async activateUser(userId: string, password: string): Promise<SafeUser> {
    const passwordHash = await this.hashPassword(password);

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        status: UserStatus.ACTIVE,
      },
      omit: { passwordHash: true },
    });
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.saltRounds);
  }

  stripPassword(user: User): SafeUser {
    const safe = { ...user };
    delete (safe as Partial<User>).passwordHash;
    return safe as SafeUser;
  }
}
