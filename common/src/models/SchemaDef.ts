import { z } from 'zod';

/** Port of `metadata.SchemaDef.Type`. */
export const SchemaType = {
  JSON: 'JSON',
  AVRO: 'AVRO',
  PROTOBUF: 'PROTOBUF',
} as const;
export type SchemaType = (typeof SchemaType)[keyof typeof SchemaType];

/** Port of `metadata.SchemaDef` (extends BaseDef: name/version). */
export const SchemaDefSchema = z.object({
  name: z.string(),
  version: z.number().int().default(1),
  type: z.nativeEnum(SchemaType).optional(),
  data: z.record(z.unknown()).optional(),
  externalRef: z.string().optional(),
});

export type SchemaDef = z.infer<typeof SchemaDefSchema>;
