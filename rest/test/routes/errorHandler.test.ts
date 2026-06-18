import { describe, expect, it } from 'vitest';
import request from 'supertest';
import express from 'express';
import { errorHandler } from '../../src/routes/errorHandler.js';
import { NotFoundException, ConflictException } from '@conductor/common';

describe('Error handler middleware', () => {
  it('returns 404 for NotFoundException', async () => {
    const app = express();
    app.get('/test', () => {
      throw new NotFoundException('not found');
    });
    app.use(errorHandler);

    const res = await request(app).get('/test');
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('not found');
  });

  it('returns 409 for ConflictException', async () => {
    const app = express();
    app.get('/test', () => {
      throw new ConflictException('conflict');
    });
    app.use(errorHandler);

    const res = await request(app).get('/test');
    expect(res.status).toBe(409);
  });

  it('returns 400 for TypeError', async () => {
    const app = express();
    app.get('/test', () => {
      throw new TypeError('bad type');
    });
    app.use(errorHandler);

    const res = await request(app).get('/test');
    expect(res.status).toBe(400);
  });

  it('returns 500 for generic Error', async () => {
    const app = express();
    app.get('/test', () => {
      throw new Error('generic');
    });
    app.use(errorHandler);

    const res = await request(app).get('/test');
    expect(res.status).toBe(500);
  });
});
