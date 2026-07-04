import { IsEmail, IsEnum } from 'class-validator';
import { Role } from '../../prisma/prisma-client';

export class CreateInvitationDto {
  @IsEmail()
  email!: string;

  @IsEnum(Role)
  role!: Role;
}
