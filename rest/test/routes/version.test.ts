import { describe, expect, it } from 'vitest';
import request from 'supertest';
import express from 'express';
import { VersionService } from '../../src/services/VersionService.js';
import { createVersionRouter } from '../../src/routes/version.js';

describe('Version API route', () => {
  it('GET /api/version returns the version string', async () => {
    const service = new VersionService('1.2.3');
    const app = express();
    app.use('/api', createVersionRouter(service));

    const res = await request(app).get('/api/version');
    expect(res.status).toBe(200);
    expect(res.text).toBe('1.2.3');
    expect(res.type).toBe('text/plain');
  });
});
