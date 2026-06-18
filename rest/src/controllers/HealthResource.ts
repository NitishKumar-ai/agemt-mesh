import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

export const START_TIME = 'START_TIME';
export const VERSION = 'VERSION';
export const DB_PROBE = 'DB_PROBE';

@ApiTags('health')
@Controller('health')
export class HealthResource {
  constructor(
    @Inject(START_TIME) private readonly startTime: number,
    @Inject(VERSION) private readonly version: string,
    @Inject(DB_PROBE) private readonly dbProbe: () => Promise<void>,
  ) {}

  @Get()
  async getHealth(): Promise<any> {
    await this.dbProbe();
    return {
      status: 'OK',
      version: this.version,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
    };
  }
}
