import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { findZodSchemas } from './zod-to-proto.js';

describe('zod-to-proto findZodSchemas', () => {
  it('should find exported ZodObject schemas ending with Schema', () => {
    const mockModule = {
      UserSchema: z.object({
        id: z.string(),
        age: z.number(),
        active: z.boolean(),
      }),
      nonSchemaExport: { foo: 'bar' },
      OtherObj: z.object({ name: z.string() }),
    };

    const schemas = findZodSchemas(mockModule);
    expect(schemas.has('User')).toBe(true);
    expect(schemas.has('OtherObj')).toBe(false);
    expect(schemas.has('nonSchemaExport')).toBe(false);
  });
});
