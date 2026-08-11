import { Module } from '@nestjs/common';
import { ProfileRepository } from './repositories/profile.repository';

@Module({
  providers: [UserService],
})
export class UserModule {}
