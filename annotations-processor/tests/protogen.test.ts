import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ProtoGen } from '../src/protogen';
import { ProtoGenTask } from '../src/index';

// To run: npx tsx --test tests/protogen.test.ts

async function testHappyPath(): Promise<void> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'protogen-test-'));
  const mapperDir = path.join(tmpDir, 'mapper');
  const protosDir = path.join(tmpDir, 'protos');
  const modelDir = path.join(protosDir, 'model');

  fs.mkdirSync(mapperDir, { recursive: true });
  fs.mkdirSync(modelDir, { recursive: true });

  const protoPackage = 'protoPackage';
  const javaPackage = 'abc.protogen.example';
  const goPackage = 'goPackage';
  const mapperPackage = 'mapperPackage';

  // Resolve the example module path
  const examplePath = path.resolve(__dirname, '..', 'example', 'example');
  const exampleJsPath = examplePath + '.js';

  // The example module needs to be compiled first; if it doesn't exist,
  // we can require it via tsx at runtime
  const modulePath = examplePath;

  const config = {
    protoPackage,
    javaPackage,
    goPackage,
    protosDir,
    mapperDir,
    mapperPackage,
    sourceModules: [modulePath],
  };

  const task = new ProtoGenTask(config);
  task.generate();

  // Check that proto file was generated
  const models = fs.readdirSync(modelDir);
  if (models.length !== 1) {
    throw new Error(`Expected 1 model file, got ${models.length}`);
  }

  const protoContent = fs.readFileSync(path.join(modelDir, 'example.proto'), 'utf-8');
  const expected = `syntax = "proto3";
package protoPackage;

option java_package = "abc.protogen.example";
option java_outer_classname = "ExamplePb";
option go_package = "goPackage";

message Example {
    string name = 1;
    int64 count = 2;
}
`;

  if (protoContent.trim() !== expected.trim()) {
    throw new Error(`Proto content mismatch\n\nExpected:\n${expected}\n\nGot:\n${protoContent}`);
  }

  // Clean up
  fs.rmSync(tmpDir, { recursive: true });
  console.log('testHappyPath PASSED');
}

async function main(): Promise<void> {
  try {
    await testHappyPath();
    console.log('All tests passed!');
  } catch (e) {
    console.error('Test failed:', e);
    process.exit(1);
  }
}

main();
