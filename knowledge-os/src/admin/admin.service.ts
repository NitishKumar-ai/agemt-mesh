
import { Injectable } from '@nestjs/common';

@Injectable()
export class AdminService {
  async getHealthStatus() {
    return { status: 'ok' };
  }

  async getAuditLogs(tenantId: string) {
    // TODO: Fetch from observability store
    return [];
  }
}
