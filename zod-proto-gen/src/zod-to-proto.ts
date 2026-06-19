import type { ZodType, ZodObject, ZodArray, ZodEnum, ZodOptional, ZodDefault, ZodNativeEnum, ZodRecord, ZodUnion, ZodLazy, ZodEffects } from 'zod';

export interface ProtoGenConfig {
  protoPackage: string;
  javaPackage: string;
  goPackage: string;
}

/**
 * Extract Zod schemas from a module's exports.
 * Finds any exported ZodObject instances with names ending in 'Schema'.
 */
export function findZodSchemas(mod: Record<string, unknown>): Map<string, ZodType> {
  const schemas = new Map<string, ZodType>();

  for (const [key, value] of Object.entries(mod)) {
    if (key.endsWith('Schema') && isZodObject(value)) {
      const name = key.replace(/Schema$/, '');
      schemas.set(name, value as ZodType);
    }
  }

  return schemas;
}

function isZodObject(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    '_def' in (value as Record<string, unknown>) &&
    'typeName' in ((value as Record<string, unknown>)._def as Record<string, unknown>)
  );
}

/**
 * Convert a Zod schema name to a Protobuf message or enum declaration.
 */
export async function generateProto(
  _name: string,
  _schema: ZodType,
  _config: ProtoGenConfig,
): Promise<string> {
  // This walks the Zod type tree and emits proto syntax.
  // Implementation pending — scaffolded for the build pipeline.
  return '';
}

/**
 * Walk a Zod schema and return its field descriptors.
 */
export function describeSchema(
  schema: ZodType,
  _visited: Set<string>,
): Array<{ name: string; protoType: string; protoIndex: number }> {
  const fields: Array<{ name: string; protoType: string; protoIndex: number }> = [];

  // Unwrap effects (preprocess, transform, default values)
  let inner = schema;
  while ((inner._def as any).typeName === 'ZodEffects' || (inner._def as any).typeName === 'ZodDefault' || (inner._def as any).typeName === 'ZodOptional') {
    inner = (inner._def as any).innerType ?? (inner._def as any).schema ?? inner;
  }

  if ((inner._def as any).typeName !== 'ZodObject') return fields;

  const shape = (inner as any).shape as Record<string, ZodType> | undefined;
  if (!shape) return fields;

  let index = 1;
  for (const [fieldName, fieldSchema] of Object.entries(shape)) {
    const protoType = zodTypeToProto(fieldSchema);
    fields.push({ name: fieldName, protoType, protoIndex: index });
    index++;
  }

  return fields;
}

/**
 * Map a Zod type to a Protobuf type string.
 */
export function zodTypeToProto(schema: ZodType): string {
  let inner = schema;
  while ((inner._def as any).typeName === 'ZodOptional' || (inner._def as any).typeName === 'ZodDefault' || (inner._def as any).typeName === 'ZodEffects') {
    inner = (inner._def as any).innerType ?? (inner._def as any).schema ?? inner;
  }

  switch ((inner._def as any).typeName) {
    case 'ZodString':
      return 'string';
    case 'ZodNumber':
      return 'double';
    case 'ZodBoolean':
      return 'bool';
    case 'ZodBigInt':
      return 'int64';
    case 'ZodArray':
      return `repeated ${zodTypeToProto((inner._def as any).type as ZodType)}`;
    case 'ZodNativeEnum':
    case 'ZodEnum':
      return 'string'; // Enums mapped as strings
    case 'ZodRecord':
      return 'map<string, google.protobuf.Value>';
    case 'ZodObject':
      return (inner._def as any).typeName ?? 'object'; // Nested message
    case 'ZodLazy':
      return 'object'; // Recursive type — reference by name
    case 'ZodUnion':
      return 'google.protobuf.Value'; // Union → dynamic value
    default:
      return 'string';
  }
}
