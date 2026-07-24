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
import { MailService } from '../mail/mail.service';
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
    private readonly mailService: MailService,
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

  async forgotPassword(email: string): Promise<void> {
    const user = await this.usersService.findByEmail(email);

    if (!user || user.status !== UserStatus.ACTIVE || !user.passwordHash) {
      return;
    }

    const token = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(token);
    const expiresInMinutes = this.config.get<number>(
      'PASSWORD_RESET_EXPIRES_IN_MINUTES',
      30,
    );
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + Number(expiresInMinutes));

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    const appUrl = this.config.get<string>('APP_URL', 'http://localhost:3000');
    const link = `${appUrl}/auth/password/reset?token=${token}`;

    await this.mailService.sendPasswordReset({ to: user.email, link });
  }

  async resetPassword(token: string, password: string): Promise<void> {
    const tokenHash = this.hashToken(token);

    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!resetToken) {
      throw new NotFoundException('Invalid reset token');
    }

    if (resetToken.consumedAt) {
      throw new BadRequestException('Reset token has already been used');
    }

    if (resetToken.expiresAt < new Date()) {
      throw new BadRequestException('Reset token has expired');
    }

    if (resetToken.user.status !== UserStatus.ACTIVE) {
      throw new BadRequestException('User account is not active');
    }

    const passwordHash = await this.usersService.hashPassword(password);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash, tokenVersion: { increment: 1 } },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { consumedAt: new Date() },
      }),
    ]);
  }

  async logout(userId: string): Promise<void> {
    await this.usersService.incrementTokenVersion(userId);
  }

  private signToken(user: User): string {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion,
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
