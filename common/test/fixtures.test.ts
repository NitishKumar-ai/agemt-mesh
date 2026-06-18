import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  WorkflowDefSchema,
  WorkflowSchema,
} from '../src/index.js';

/** Load a real Java-side JSON fixture (copied from core/src/test/resources). */
function loadFixture(name: string): unknown {
  const path = fileURLToPath(new URL(`../src/test/resources/${name}`, import.meta.url));
  return JSON.parse(readFileSync(path, 'utf-8'));
}

describe('Fixture parity: real Java JSON parses through the zod schemas', () => {
  it('parses WorkflowDef fixtures (conditional_flow.json)', () => {
    const def = WorkflowDefSchema.parse(loadFixture('conditional_flow.json'));
    expect(def.name).toBeTruthy();
    expect(def.tasks.length).toBeGreaterThan(0);
    // Defaults the Java JSON omits are filled in:
    expect(def.schemaVersion).toBeGreaterThanOrEqual(1);
  });

  it('parses a switch/decision WorkflowDef (conditional_flow_with_switch.json)', () => {
    const def = WorkflowDefSchema.parse(loadFixture('conditional_flow_with_switch.json'));
    expect(def.tasks.length).toBeGreaterThan(0);
  });

  it('parses a completed runtime Workflow (completed.json) with 15 tasks', () => {
    const wf = WorkflowSchema.parse(loadFixture('completed.json'));
    expect(wf.status).toBe('COMPLETED');
    expect(wf.tasks.length).toBe(15);
  });
});

describe('Round-trip idempotency: parse → JSON → parse is stable', () => {
  const cases: Array<[string, typeof WorkflowDefSchema | typeof WorkflowSchema]> = [
    ['conditional_flow.json', WorkflowDefSchema],
    ['conditional_flow_with_switch.json', WorkflowDefSchema],
    ['completed.json', WorkflowSchema],
  ];

  it.each(cases)('%s round-trips without drift', (name, schema) => {
    const first = schema.parse(loadFixture(name));
    const second = schema.parse(JSON.parse(JSON.stringify(first)));
    expect(second).toEqual(first);
  });
});
