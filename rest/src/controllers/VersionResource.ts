import { Controller, Get, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { VersionService } from '../services/VersionService.js';

@ApiTags('version')
@Controller('api/version')
export class VersionResource {
  constructor(private readonly versionService: VersionService) {}

  @Get()
  getVersion(@Res() res: Response): void {
    res.type('text/plain').send(this.versionService.getVersion());
  }
}
