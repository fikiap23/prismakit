export type InferRepositoryPayload<
  TSelect extends object,
  T extends TSelect,
  TToPayload,
> =
  TToPayload extends <U extends T>(data: unknown) => infer R
    ? R
    : TToPayload extends (data: unknown) => infer R
      ? R
      : never;
