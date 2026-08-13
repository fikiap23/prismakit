import { createDefineRepo } from '@prismakit/nestjs';

/**
 * Minimal TypeMap stub for the in-memory example (no generated Prisma client).
 * Real apps use `createDefineRepo<Prisma.TypeMap>({ ... })`.
 */
type ExampleTypeMap = {
  meta: { modelProps: 'user' };
  model: {
    User: {
      payload: {
        name: 'User';
        scalars: unknown;
        objects: unknown;
        composites: unknown;
      };
      operations: Record<string, { args: unknown; result: unknown }>;
    };
  };
};

export const defineAppRepo = createDefineRepo<ExampleTypeMap>({
  cache: { ttl: 60 },
});
