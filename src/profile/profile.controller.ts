import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { type SafeUser } from '../users/users.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { InitiateAvatarUploadDto } from './dto/initiate-avatar-upload.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ProfileService } from './profile.service';

@Controller('profile')
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Patch()
  update(
    @CurrentUser() user: SafeUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<SafeUser> {
    return this.profileService.updateProfile(user.id, dto);
  }

  @Patch('password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @CurrentUser() user: SafeUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    await this.profileService.changePassword(user.id, dto);
  }

  @Post('avatar/uploads')
  initiateAvatarUpload(
    @CurrentUser() user: SafeUser,
    @Body() dto: InitiateAvatarUploadDto,
  ): Promise<{ uploadId: string; url: string }> {
    return this.profileService.initiateAvatarUpload(user.id, dto);
  }

  @Post('avatar/uploads/:id/complete')
  @HttpCode(HttpStatus.OK)
  completeAvatarUpload(
    @CurrentUser() user: SafeUser,
    @Param('id') uploadId: string,
  ): Promise<SafeUser> {
    return this.profileService.completeAvatarUpload(user.id, uploadId);
  }
}
