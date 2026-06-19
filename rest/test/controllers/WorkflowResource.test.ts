import { describe, expect, it, vi } from 'vitest';
import { HttpException, HttpStatus } from '@nestjs/common';
import { NotFoundException, ConflictException } from '@agentmesh/common';
import { WorkflowResource } from '../../src/controllers/WorkflowResource.js';
import type { WorkflowService } from '../../src/services/WorkflowService.js';

function makeResource(serviceOverrides: Partial<WorkflowService>): WorkflowResource {
  return new WorkflowResource(serviceOverrides as WorkflowService);
}

async function expectStatus(promise: Promise<unknown>, status: HttpStatus): Promise<void> {
  let caught: unknown;
  try {
    await promise;
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(HttpException);
  expect((caught as HttpException).getStatus()).toBe(status);
}

describe('WorkflowResource error mapping', () => {
  it('maps a typed NotFoundException to 404 regardless of wording', async () => {
    const resource = makeResource({
      pauseWorkflow: vi.fn().mockRejectedValue(new NotFoundException('whatever wording')),
    });
    await expectStatus(resource.pauseWorkflow('wf-1'), HttpStatus.NOT_FOUND);
  });

  it('maps a typed ConflictException to 409 regardless of wording', async () => {
    const resource = makeResource({
      resumeWorkflow: vi.fn().mockRejectedValue(new ConflictException('whatever wording')),
    });
    await expectStatus(resource.resumeWorkflow('wf-1'), HttpStatus.CONFLICT);
  });

  it('a typed ConflictException maps to 409 even when its message would have matched no legacy substring', async () => {
    // Proves the fix: this message contains none of the legacy substring-matched
    // words ("already", "still", "terminal", "not in", "cannot terminate",
    // "unable to", "not started"), so the old string-sniffing implementation
    // would have fallen through to 400. The typed-error check now short-circuits
    // before the substring fallback is ever reached.
    const resource = makeResource({
      terminateWorkflow: vi.fn().mockRejectedValue(new ConflictException('nope, not happening')),
    });
    await expectStatus(resource.terminateWorkflow('wf-1', 'because'), HttpStatus.CONFLICT);
  });

  it('falls back to substring matching for legacy plain-Error paths', async () => {
    const resource = makeResource({
      pauseWorkflow: vi.fn().mockRejectedValue(new Error('Workflow wf-1 not found')),
    });
    await expectStatus(resource.pauseWorkflow('wf-1'), HttpStatus.NOT_FOUND);
  });

  it('falls back to 400 for an unrecognized plain-Error message', async () => {
    const resource = makeResource({
      pauseWorkflow: vi.fn().mockRejectedValue(new Error('totally unrelated failure')),
    });
    await expectStatus(resource.pauseWorkflow('wf-1'), HttpStatus.BAD_REQUEST);
  });
});
