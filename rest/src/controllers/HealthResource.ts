import { Controller, Get, Res, Inject, Optional } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';

export const START_TIME = 'START_TIME';
export const VERSION = 'VERSION';
export const DB_PROBE = 'DB_PROBE';
export type DbProbe = () => Promise<void>;

@ApiTags('health')
@Controller('health')
export class HealthResource {
  constructor(
    @Inject(START_TIME) private readonly startTime: number,
    @Inject(VERSION) private readonly version: string,
    @Optional() @Inject(DB_PROBE) private readonly dbProbe?: DbProbe,
  ) {}

  @Get()
  async healthCheck(@Res() res: Response): Promise<void> {
    const uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);
    let dbStatus: 'ok' | 'error' = 'ok';

    if (this.dbProbe) {
      try {
        await this.dbProbe();
      } catch {
        dbStatus = 'error';
      }
    }

    const isUp = dbStatus === 'ok';

    res.status(isUp ? 200 : 503).json({
      status: isUp ? 'UP' : 'DOWN',
      version: this.version,
      db: dbStatus,
      uptimeSeconds,
    });
  }
}
