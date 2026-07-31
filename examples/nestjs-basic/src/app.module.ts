import { Module } from '@nestjs/common';
import { PrismaKitModule } from '@prismakit/nestjs';
import { MemoryCacheAdapter } from './memory-cache.js';
import { prisma } from './prisma.js';
import { UserController, UserService } from './user.js';
import { UserRepository } from './user.repository.js';

@Module({
  imports: [
    PrismaKitModule.forRoot({
      prisma,
      cache: new MemoryCacheAdapter('example'),
      cacheModels: ['user'],
    }),
  ],
  controllers: [UserController],
  providers: [UserService, UserRepository],
})
export class AppModule {}
