import { afterEach, describe, expect, it, vi } from 'vitest';

import { orchestrationApi } from '../lib/orchestrationApi';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('orchestrationApi', () => {
  it('requests a workflow definition with encoded name and version', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ name: 'daily report', version: 3, tasks: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(orchestrationApi.getWorkflowDef('daily report', 3)).resolves.toMatchObject({
      name: 'daily report',
      version: 3,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/orchestration/metadata/workflow/daily%20report?version=3',
      expect.objectContaining({
        headers: expect.objectContaining({ Accept: 'application/json' }),
      }),
    );
  });

  it('surfaces the response body when an API request fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('WorkflowDef missing not found', { status: 404 }),
    );

    await expect(orchestrationApi.getWorkflowDef('missing')).rejects.toThrow(
      'WorkflowDef missing not found',
    );
  });
});
