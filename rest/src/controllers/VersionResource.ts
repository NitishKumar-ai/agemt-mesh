import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { VersionService } from '../services/VersionService.js';

@ApiTags('metadata')
@Controller('api/version')
export class VersionResource {
  constructor(private readonly versionService: VersionService) {}

  @Get()
  getVersion(): string {
    return this.versionService.getVersion();
  }
}
