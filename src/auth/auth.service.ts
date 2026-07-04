/* eslint-disable @typescript-eslint/no-unsafe-argument,
                  @typescript-eslint/no-unsafe-assignment,
                  @typescript-eslint/no-unsafe-member-access */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes, createHash } from 'crypto';
import type { StringValue } from 'ms';
import {
  Role,
  UserStatus,
  type User,
  type UserInvitation,
} from '../prisma/prisma-client';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService, type SafeUser } from '../users/users.service';

export interface LoginResult {
  accessToken: string;
  user: SafeUser;
}

export interface InvitationResult {
  invitation: UserInvitation;
  token: string;
  link: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async login(email: string, password: string): Promise<LoginResult> {
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status === UserStatus.PENDING) {
      throw new UnauthorizedException('Account is pending activation');
    }

    if (user.status === UserStatus.DISABLED) {
      throw new UnauthorizedException('Account is disabled');
    }

    if (!user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const matches = await bcrypt.compare(password, user.passwordHash);

    if (!matches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const accessToken = this.signToken(user);

    return {
      accessToken,
      user: this.usersService.stripPassword(user),
    };
  }

  async createInvitation(
    createdByUserId: string,
    email: string,
    role: Role,
  ): Promise<InvitationResult> {
    const existing = await this.usersService.findByEmail(email);

    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }

    const user = await this.usersService.createInviteUser(email, role);

    const token = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(token);
    const expiresInDays = this.config.get<number>('INVITE_EXPIRES_IN_DAYS', 7);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + Number(expiresInDays));

    const invitation = await this.prisma.userInvitation.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
        createdByUserId,
      },
    });

    const appUrl = this.config.get<string>('APP_URL', 'http://localhost:3000');
    const link = `${appUrl}/auth/invitations/accept?token=${token}`;

    return { invitation, token, link };
  }

  async acceptInvitation(token: string, password: string): Promise<SafeUser> {
    const tokenHash = this.hashToken(token);

    const invitation = await this.prisma.userInvitation.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!invitation) {
      throw new NotFoundException('Invalid invitation token');
    }

    if (invitation.acceptedAt) {
      throw new BadRequestException('Invitation has already been used');
    }

    if (invitation.expiresAt < new Date()) {
      throw new BadRequestException('Invitation has expired');
    }

    if (invitation.user.status === UserStatus.DISABLED) {
      throw new BadRequestException('User account is disabled');
    }

    const updatedUser = await this.usersService.activateUser(
      invitation.userId,
      password,
    );

    await this.prisma.userInvitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() },
    });

    return updatedUser;
  }

  async getCurrentUser(userId: string): Promise<SafeUser | null> {
    const user = await this.usersService.findById(userId);
    return user ? this.usersService.stripPassword(user) : null;
  }

  private signToken(user: User): string {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    return this.jwtService.sign(payload, {
      secret: this.config.getOrThrow<string>('JWT_SECRET'),
      expiresIn: this.config.get<string>('JWT_EXPIRES_IN', '1h') as StringValue,
    });
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
