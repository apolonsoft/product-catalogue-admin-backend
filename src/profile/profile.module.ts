import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StorageModule } from '../storage/storage.module';
import { UsersModule } from '../users/users.module';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';

@Module({
  imports: [ConfigModule, UsersModule, StorageModule],
  controllers: [ProfileController],
  providers: [ProfileService],
})
export class ProfileModule {}
