import { createInjectableRepository } from '@prismakit/nestjs';

export const UserRepository = createInjectableRepository({
  model: 'user',
  scalarFields: { id: 'id', email: 'email', name: 'name' },
  cache: { ttl: 60 },
});

export type UserRepository = InstanceType<typeof UserRepository>;
