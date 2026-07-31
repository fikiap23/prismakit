import type { ApplyRepoPayload, RepoPayloadHKT } from './repo-types.type';

/**
 * Infer repository method return type from `toPayload`.
 *
 * Prefer the HKT brand (`__hkt`) stamped by {@link ToPayloadFromTypes} so
 * Prisma `GetPayload` stays precise for each concrete select.
 */
export type InferRepositoryPayload<
  TSelect extends object,
  T extends TSelect,
  TToPayload,
> =
  // 1) HKT brand from ToPayloadFromTypes (strong Prisma path)
  TToPayload extends { readonly __hkt: infer HKT }
    ? HKT extends RepoPayloadHKT
      ? ApplyRepoPayload<HKT, T>
      : never
    : // 2) Generic toPayload applied with this concrete select
      TToPayload extends <U extends T>(data: unknown) => infer R
      ? R
      : // 3) Non-generic toPayload
        TToPayload extends (data: unknown) => infer R
        ? R
        : never;
