import { describe, expect, it } from 'vitest';

import { validateWorkflow } from '../src/index.js';

describe('@conductor/core consumes @conductor/common across the package boundary', () => {
  it('validateWorkflow normalizes a minimal def using common defaults', () => {
    const wf = validateWorkflow({ name: 'cross_pkg_wf' });
    expect(wf.name).toBe('cross_pkg_wf');
    expect(wf.version).toBe(1);
    expect(wf.schemaVersion).toBe(2);
    expect(wf.restartable).toBe(true);
  });

  it('rejects an invalid def (missing name)', () => {
    expect(() => validateWorkflow({})).toThrow();
  });
});
