#!/usr/bin/env node
import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { ProtoGen } from './protogen';

interface ProtoGenConfig {
  protoPackage: string;
  javaPackage: string;
  goPackage: string;
  protosDir: string;
  mapperDir: string;
  mapperPackage: string;
  sourceModules: string[];
}

export class ProtoGenTask {
  private config: ProtoGenConfig;

  constructor(config: ProtoGenConfig) {
    this.config = config;
  }

  generate(): void {
    const generator = new ProtoGen(
      this.config.protoPackage,
      this.config.javaPackage,
      this.config.goPackage,
    );

    for (const mod of this.config.sourceModules) {
      const resolvedPath = path.resolve(mod);
      console.log(`protogen: processing module '${resolvedPath}'`);
      generator.processModule(resolvedPath);
    }

    if (!fs.existsSync(this.config.mapperDir)) {
      fs.mkdirSync(this.config.mapperDir, { recursive: true });
    }
    generator.writeMapper(this.config.mapperDir, this.config.mapperPackage);

    if (!fs.existsSync(this.config.protosDir)) {
      fs.mkdirSync(this.config.protosDir, { recursive: true });
    }
    generator.writeProtos(this.config.protosDir);
  }
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.length < 8) {
    console.error('Usage: protogen <protoPackage> <javaPackage> <goPackage> <protosDir> <mapperDir> <mapperPackage> <sourceModules...>');
    console.error('  sourceModules: space-separated list of JS/TS module paths to scan for decorated classes');
    process.exit(1);
  }

  const protoPackage = args[0];
  const javaPackage = args[1];
  const goPackage = args[2];
  const protosDir = args[3];
  const mapperDir = args[4];
  const mapperPackage = args[5];
  const sourceModules = args.slice(6);

  const config: ProtoGenConfig = {
    protoPackage,
    javaPackage,
    goPackage,
    protosDir,
    mapperDir,
    mapperPackage,
    sourceModules,
  };

  console.log('Running protogen with arguments:', config);

  const task = new ProtoGenTask(config);
  task.generate();

  console.log('protogen completed.');
}

if (require.main === module) {
  main();
}
