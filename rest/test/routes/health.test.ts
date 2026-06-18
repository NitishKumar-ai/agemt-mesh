import { describe, expect, it } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createHealthRouter } from '../../src/routes/health.js';

function makeApp(probe?: () => Promise<void>) {
  const app = express();
  app.use('/', createHealthRouter('1.2.3', probe));
  return app;
}

describe('GET /health', () => {
  it('returns 200 with UP when no probe is provided', async () => {
    const res = await request(makeApp()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'UP', version: '1.2.3', db: 'ok' });
    expect(typeof res.body.uptimeSeconds).toBe('number');
  });

  it('returns 200 with UP when DB probe passes', async () => {
    const res = await request(makeApp(async () => {})).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'UP', db: 'ok' });
  });

  it('returns 503 with DOWN when DB probe throws', async () => {
    const probe = async () => { throw new Error('connection refused'); };
    const res = await request(makeApp(probe)).get('/health');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: 'DOWN', db: 'error' });
  });
});
