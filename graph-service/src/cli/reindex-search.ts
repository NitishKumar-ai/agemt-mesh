import { graphService } from '../services/GraphService.js';
import { neo4jClient } from '../infra/neo4j.client.js';
import { postgresClient } from '../infra/postgres.client.js';

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

const tenantId = argument('tenant') ?? process.env.REINDEX_TENANT_ID;
const batchSize = Number(argument('batch-size') ?? process.env.REINDEX_BATCH_SIZE ?? 64);

if (!tenantId) {
  throw new Error('Provide --tenant=<tenant-id> or set REINDEX_TENANT_ID');
}
if (!Number.isInteger(batchSize) || batchSize <= 0) {
  throw new Error('Reindex batch size must be a positive integer');
}

try {
  const report = await graphService.reindexSearch(tenantId, batchSize);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await Promise.all([graphService.closeSearchIndex(), neo4jClient.close(), postgresClient.close()]);
}
