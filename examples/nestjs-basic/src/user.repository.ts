import { createInjectableRepository } from '@prismakit/nestjs';

export class UserRepository extends createInjectableRepository({
  model: 'user',
  scalarFields: { id: 'id', email: 'email', name: 'name' },
  cache: { ttl: 60 },
}) {}
