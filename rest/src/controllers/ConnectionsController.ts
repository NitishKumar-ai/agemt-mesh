import { Body, Controller, Delete, Get, Inject, Param, Post } from '@nestjs/common';
import { CONNECTION_SERVICE, ConnectionService } from '../services/ConnectionService.js';

@Controller('api/agents/connections')
export class ConnectionsController {
  constructor(
    @Inject(CONNECTION_SERVICE) private readonly connectionService: ConnectionService,
  ) {}

  @Get()
  async listConnections() {
    return this.connectionService.listConnectionsApi();
  }

  @Get('available')
  listAvailableConnectors() {
    return this.connectionService.listAvailableConnectorsApi();
  }

  @Post()
  async createConnection(@Body() body: any) {
    return this.connectionService.createManualConnection(body);
  }

  @Delete(':id')
  async deleteConnection(@Param('id') id: string) {
    await this.connectionService.deleteConnection(id);
  }
}
