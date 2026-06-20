import { describe, expect, it, vi } from 'vitest';
import { AdminResource } from '../../src/controllers/AdminResource.js';
import type { AdminService } from '../../src/services/AdminService.js';

describe('AdminResource', () => {
  it('successfully returns metrics from AdminService', async () => {
    const mockMetrics = {
      syncLagMinutes: 5,
      parseSuccessRate: 99.1,
      f1Score: 0.92,
      nodeCount: 15,
      edgeCount: 22,
      timestamp: new Date().toISOString(),
    };

    const mockAdminService = {
      getSystemMetrics: vi.fn().mockResolvedValue(mockMetrics),
    } as unknown as AdminService;

    const resource = new AdminResource(mockAdminService);
    const result = await resource.getMetrics();

    expect(result).toEqual(mockMetrics);
    expect(mockAdminService.getSystemMetrics).toHaveBeenCalledOnce();
  });
});
