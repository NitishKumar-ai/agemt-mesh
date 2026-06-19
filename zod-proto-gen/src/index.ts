#!/usr/bin/env node
/**
 * Zod-to-Protobuf schema generator.
 *
 * Reads exported Zod schemas from TypeScript modules and generates
 * .proto files. Works at runtime by introspecting compiled Zod objects.
 *
 * Usage:
 *   zod-proto-gen <protoPackage> <javaPackage> <goPackage> <outputDir> <sourceModules...>
 */

import { findZodSchemas, generateProto } from './zod-to-proto.js';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

interface Config {
  protoPackage: string;
  javaPackage: string;
  goPackage: string;
  outputDir: string;
  sourceModules: string[];
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length < 5) {
    console.error(
      'Usage: zod-proto-gen <protoPackage> <javaPackage> <goPackage> <outputDir> <sourceModules...>',
    );
    process.exit(1);
  }

  const config: Config = {
    protoPackage: args[0]!,
    javaPackage: args[1]!,
    goPackage: args[2]!,
    outputDir: resolve(args[3]!),
    sourceModules: args.slice(4),
  };

  const modelDir = join(config.outputDir, 'model');
  if (!existsSync(modelDir)) {
    mkdirSync(modelDir, { recursive: true });
  }

  for (const modPath of config.sourceModules) {
    const resolvedPath = resolve(modPath);
    console.log(`zod-proto-gen: scanning ${resolvedPath}`);

    try {
      const mod = await import(resolvedPath);
      const schemas = findZodSchemas(mod);

      for (const [name, schema] of schemas) {
        const proto = await generateProto(name, schema, config);
        if (proto) {
          const filename = join(modelDir, `${name.toLowerCase()}.proto`);
          writeFileSync(filename, proto);
          console.log(`  wrote ${filename}`);
        }
      }
    } catch (err) {
      console.error(`  error processing ${resolvedPath}:`, err);
    }
  }
}

main().catch((err) => {
  console.error('zod-proto-gen failed:', err);
  process.exit(1);
});
