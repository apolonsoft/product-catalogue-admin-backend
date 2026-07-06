import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { Keyv } from 'keyv';
import { KeyvCacheableMemory } from 'cacheable';
import KeyvRedis from '@keyv/redis';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { ProfileModule } from './profile/profile.module';
import { StorageModule } from './storage/storage.module';
import { UsersModule } from './users/users.module';
import { PrismaModule } from './prisma/prisma.module';
@Module({
  imports: [
    ConfigModule.forRoot(),
    CacheModule.registerAsync({
      useFactory: () => {
        return {
          stores: [
            new Keyv({
              store: new KeyvCacheableMemory({ ttl: 60000, lruSize: 5000 }),
            }),
            new KeyvRedis('redis://localhost:6379'),
          ],
        };
      },
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    StorageModule,
    ProfileModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
