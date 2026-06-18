/**
 * Jackson (the Java JSON serializer Conductor uses) emits `null` for unset
 * optional fields. zod's `.optional()` accepts only `undefined`, so when parsing
 * real Conductor JSON we first treat `null` as "absent" by recursively dropping
 * null-valued properties. Applied via `z.preprocess` on the top-level schemas.
 */
export function stripNullsDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripNullsDeep);
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === null) continue;
      out[key] = stripNullsDeep(v);
    }
    return out;
  }
  return value;
}
