import { afterEach, describe, expect, it, vi } from 'vitest';
import { pageForPath } from '../App';
import { api } from '../lib/api';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('production UI routing', () => {
  it.each([
    ['/', 'home'],
    ['/home', 'home'],
    ['/ask?q=current', 'ask'],
    ['/briefs', 'briefs'],
    ['/knowledge/entities/project-atlas', 'knowledge'],
    ['/admin/sources/slack', 'sources'],
    ['/admin/automation', 'automation'],
    ['/admin/audit', 'audit'],
    ['/labs/session', 'session'],
  ])('maps %s to %s', (path, page) => {
    expect(pageForPath(path)).toBe(page);
  });
});

describe('trusted answer API', () => {
  it('sends the question and explicit scope to the workflow query endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          answer: 'Project Atlas moved to August.',
          confidence: 0.91,
          level: 'high',
          citations: [],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await api.askQuestion('What changed?', 'project_atlas');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/workflows/query',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ query: 'What changed?', projectId: 'project_atlas' }),
      }),
    );
  });
});
