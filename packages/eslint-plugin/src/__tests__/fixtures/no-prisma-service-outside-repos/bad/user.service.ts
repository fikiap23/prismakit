import { PrismaService } from '@nestjs/common';

export class UserService {
  constructor(prisma) {
    this.prisma = prisma;
  }
}
