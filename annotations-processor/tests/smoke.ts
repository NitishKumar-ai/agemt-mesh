// @ts-nocheck
import 'reflect-metadata';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const { ProtoMessage, ProtoField } = require('@conductor/annotations');
const { ProtoGen } = require('../dist/protogen');
const { ProtoFile } = require('../dist/proto-file');

@ProtoMessage()
class SmokeTest {
  @ProtoField({ id: 1 })
  name!: string;

  @ProtoField({ id: 2 })
  count!: bigint;
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'protogen-'));
const mapperDir = path.join(tmpDir, 'mapper');
const protosDir = path.join(tmpDir, 'protos');

fs.mkdirSync(mapperDir, { recursive: true });
fs.mkdirSync(protosDir, { recursive: true });

const gen = new ProtoGen('protoPackage', 'abc.protogen.example', 'goPackage');
gen['protoFiles'].push(
  new ProtoFile(SmokeTest, 'protoPackage', 'abc.protogen.example', 'goPackage')
);
gen.writeMapper(mapperDir, 'mapperPackage');
gen.writeProtos(protosDir);

const protoContent = fs.readFileSync(path.join(protosDir, 'model', 'smoketest.proto'), 'utf-8');
const mapperContent = fs.readFileSync(path.join(mapperDir, 'AbstractProtoMapper.ts'), 'utf-8');

const expectedProto = `syntax = "proto3";
package protoPackage;


option java_package = "abc.protogen.example";
option java_outer_classname = "SmokeTestPb";
option go_package = "goPackage";

message SmokeTest {
    string name = 1;
    int64 count = 2;
}
`;

if (protoContent.trim() !== expectedProto.trim()) {
  console.error('Proto content mismatch');
  console.error('Expected:\n' + expectedProto);
  console.error('Got:\n' + protoContent);
  process.exit(1);
}

if (!mapperContent.includes('toProto') || !mapperContent.includes('fromProto')) {
  console.error('Mapper missing methods');
  process.exit(1);
}

console.log('Proto content OK');
console.log('Mapper content OK');
console.log('ALL SMOKE TESTS PASSED');
fs.rmSync(tmpDir, { recursive: true });
