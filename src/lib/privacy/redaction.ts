const SENSITIVE_FIELDS = new Set([
  "owner_name", "owner_phone", "owner_wechat",
  "client_phone", "client_wechat",
  "exact_address", "building_no", "unit_no", "room_no",
  "internal_notes", "key_location",
]);

export function redactSensitiveFields<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    if (!SENSITIVE_FIELDS.has(key)) result[key] = obj[key];
  }
  return result as Partial<T>;
}

export function isSensitiveField(fieldName: string): boolean {
  return SENSITIVE_FIELDS.has(fieldName);
}

export function getSensitiveFieldNames(): ReadonlySet<string> {
  return SENSITIVE_FIELDS;
}
