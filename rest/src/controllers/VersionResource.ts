import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { VersionService } from '../services/VersionService.js';
import { OidcAuthGuard, Public } from '../OidcAuthGuard.js';

@ApiTags('metadata')
@UseGuards(OidcAuthGuard)
@Public()
@Controller('api/version')
export class VersionResource {
  constructor(private readonly versionService: VersionService) {}

  @Get()
  getVersion(): string {
    return this.versionService.getVersion();
  }
}
