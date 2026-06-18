import { Client } from 'cassandra-driver';

export class CassandraBaseDAO {
  protected client: Client;

  constructor(client: Client) {
    this.client = client;
  }
}
