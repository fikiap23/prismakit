import { Controller, Get, Inject, Injectable, Param } from '@nestjs/common';
import { UserRepository } from './user.repository.js';

@Injectable()
export class UserService {
  constructor(
    @Inject(UserRepository) private readonly users: UserRepository,
  ) {}

  handleGetById(id: string) {
    return this.users.getThrowById({
      id,
      select: { id: true, email: true, name: true },
      setCache: true,
    });
  }
}

@Controller('users')
export class UserController {
  constructor(@Inject(UserService) private readonly users: UserService) {}

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.users.handleGetById(id);
  }
}
