import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { Module, Controller, Get, UseGuards } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { OidcAuthGuard, Public } from '../src/OidcAuthGuard.js';

@Controller('test-protected')
@UseGuards(OidcAuthGuard)
class TestProtectedController {
  @Get()
  getProtected() {
    return { ok: true };
  }
}

@Controller('test-public')
@UseGuards(OidcAuthGuard)
@Public()
class TestPublicController {
  @Get()
  getPublic() {
    return { ok: true };
  }
}

@Module({
  controllers: [TestProtectedController, TestPublicController],
})
class TestAppModule {}

describe('OidcAuthGuard Integration', () => {
  let app: any;
  const secret = 'super-secret-key-change-me';

  beforeAll(async () => {
    try {
      app = await NestFactory.create(TestAppModule, { logger: ['log', 'error', 'warn', 'debug', 'verbose'] });
      await app.init();
    } catch (e) {
      console.error('NestJS initialization error:', e);
      throw e;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows access to public controller without token', async () => {
    const res = await request(app.getHttpServer())
      .get('/test-public')
      .expect(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('blocks access to protected controller without token', async () => {
    const res = await request(app.getHttpServer())
      .get('/test-protected')
      .expect(401);
    expect(res.body.message).toContain('Missing authorization header');
  });

  it('allows access to protected controller with valid token', async () => {
    const token = jwt.sign({ id: '123' }, secret);
    const res = await request(app.getHttpServer())
      .get('/test-protected')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('blocks access to protected controller with expired token', async () => {
    const token = jwt.sign({ id: '123' }, secret, { expiresIn: '-5s' });
    const res = await request(app.getHttpServer())
      .get('/test-protected')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
    expect(res.body.message).toContain('jwt expired');
  });
});
