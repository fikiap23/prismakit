/**
 * Returns true if the select object requests any field in the sensitive list.
 * When select is undefined (full row), it is always considered sensitive.
 */
export function selectIncludesSensitiveField(
  select: object | undefined,
  sensitiveFields: string[],
): boolean {
  if (!select) return sensitiveFields.length > 0;
  return sensitiveFields.some(
    (field) => (select as Record<string, unknown>)[field] === true,
  );
}
