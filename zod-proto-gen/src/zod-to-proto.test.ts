import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { findZodSchemas, zodTypeToProto, describeSchema, generateProto } from './zod-to-proto.js';

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

describe('zodTypeToProto', () => {
  it('should map basic Zod types to Proto type strings', () => {
    expect(zodTypeToProto(z.string())).toBe('string');
    expect(zodTypeToProto(z.number())).toBe('double');
    expect(zodTypeToProto(z.boolean())).toBe('bool');
    expect(zodTypeToProto(z.bigint())).toBe('int64');
  });

  it('should map ZodOptional, ZodDefault, and ZodEffects by unwrapping them', () => {
    expect(zodTypeToProto(z.string().optional())).toBe('string');
    expect(zodTypeToProto(z.number().default(42))).toBe('double');
    expect(zodTypeToProto(z.preprocess((val) => String(val), z.boolean()))).toBe('bool');
  });

  it('should map ZodArray to repeated type', () => {
    expect(zodTypeToProto(z.array(z.string()))).toBe('repeated string');
    expect(zodTypeToProto(z.array(z.number().optional()))).toBe('repeated double');
  });

  it('should map ZodEnum and ZodNativeEnum to string', () => {
    expect(zodTypeToProto(z.enum(['Admin', 'User']))).toBe('string');
    enum Role { Admin, User }
    expect(zodTypeToProto(z.nativeEnum(Role))).toBe('string');
  });

  it('should map ZodRecord to map string value', () => {
    expect(zodTypeToProto(z.record(z.string()))).toBe('map<string, google.protobuf.Value>');
  });

  it('should map ZodObject to typeName or object', () => {
    const nested = z.object({ foo: z.string() });
    expect(zodTypeToProto(nested)).toBe('ZodObject');
  });

  it('should map ZodLazy to object', () => {
    const lazyType = z.lazy(() => z.string());
    expect(zodTypeToProto(lazyType)).toBe('object');
  });

  it('should map ZodUnion to google.protobuf.Value', () => {
    expect(zodTypeToProto(z.union([z.string(), z.number()]))).toBe('google.protobuf.Value');
  });

  it('should map default fallback to string', () => {
    // Custom schema fallback
    const custom = z.any();
    expect(zodTypeToProto(custom)).toBe('string');
  });
});

describe('describeSchema', () => {
  it('should return empty array for non-ZodObject', () => {
    const fields = describeSchema(z.string(), new Set());
    expect(fields).toEqual([]);
  });

  it('should return fields for ZodObject and unwrap optional/default wrapper', () => {
    const schema = z.object({
      id: z.string(),
      count: z.number().default(0),
      meta: z.record(z.string()).optional(),
    });

    const fields = describeSchema(schema, new Set());
    expect(fields).toEqual([
      { name: 'id', protoType: 'string', protoIndex: 1 },
      { name: 'count', protoType: 'double', protoIndex: 2 },
      { name: 'meta', protoType: 'map<string, google.protobuf.Value>', protoIndex: 3 },
    ]);
  });

  it('should unwrap outer effects/optional wrappers on ZodObject itself', () => {
    const schema = z.object({
      name: z.string(),
    }).optional();

    const fields = describeSchema(schema, new Set());
    expect(fields).toEqual([
      { name: 'name', protoType: 'string', protoIndex: 1 },
    ]);
  });
});

describe('generateProto', () => {
  it('should return empty string as it is scaffolded', async () => {
    const config = {
      protoPackage: 'test.package',
      javaPackage: 'com.test',
      goPackage: 'github.com/test',
    };
    const schema = z.object({ name: z.string() });
    const proto = await generateProto('Test', schema, config);
    expect(proto).toBe('');
  });
});
