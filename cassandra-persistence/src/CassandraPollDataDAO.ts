import { PollDataDAO } from '@agentmesh/common-persistence';
import { PollData } from '@agentmesh/common';
import { Client } from 'cassandra-driver';
import { CassandraBaseDAO } from './CassandraBaseDAO.js';

export class CassandraPollDataDAO extends CassandraBaseDAO implements PollDataDAO {
  constructor(client: Client) {
    super(client);
  }

  async updateLastPollData(taskDefName: string, domain: string, workerId: string): Promise<void> {
    const query = 'UPDATE poll_data SET last_poll_time = ?, worker_id = ? WHERE queue_name = ? AND domain = ?';
    await this.client.execute(query, [Date.now(), workerId, taskDefName, domain ?? 'DEFAULT'], { prepare: true });
  }

  async getPollData(taskDefName: string, domain: string): Promise<PollData | undefined> {
    const query = 'SELECT * FROM poll_data WHERE queue_name = ? AND domain = ?';
    const result = await this.client.execute(query, [taskDefName, domain ?? 'DEFAULT'], { prepare: true });
    if (result.rowLength === 0) {
      return undefined;
    }
    const row = result.first();
    return {
      queueName: row.get('queue_name'),
      domain: row.get('domain'),
      workerId: row.get('worker_id'),
      lastPollTime: row.get('last_poll_time'),
    };
  }

  async getPollDataForTask(taskDefName: string): Promise<PollData[]> {
    const query = 'SELECT * FROM poll_data WHERE queue_name = ? ALLOW FILTERING';
    const result = await this.client.execute(query, [taskDefName], { prepare: true });
    return result.rows.map(row => ({
      queueName: row.get('queue_name'),
      domain: row.get('domain'),
      workerId: row.get('worker_id'),
      lastPollTime: row.get('last_poll_time'),
    }));
  }

  async getAllPollData(): Promise<PollData[]> {
    const query = 'SELECT * FROM poll_data';
    const result = await this.client.execute(query, [], { prepare: true });
    return result.rows.map(row => ({
      queueName: row.get('queue_name'),
      domain: row.get('domain'),
      workerId: row.get('worker_id'),
      lastPollTime: row.get('last_poll_time'),
    }));
  }
}
