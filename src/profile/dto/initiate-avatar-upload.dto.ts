import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export const ALLOWED_AVATAR_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export class InitiateAvatarUploadDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsIn(ALLOWED_AVATAR_TYPES)
  type!: string;

  @IsInt()
  @Min(1)
  size!: number;

  @IsString()
  @IsOptional()
  hash?: string;
}
