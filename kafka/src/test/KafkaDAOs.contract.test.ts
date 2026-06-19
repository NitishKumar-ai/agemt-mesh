import { afterAll, beforeAll, describe } from 'vitest';
import { execSync } from 'child_process';
import { Kafka, KafkaConfig, logLevel } from 'kafkajs';
import { runQueueDAOContractTests } from '../../common-persistence/test/QueueDAO.contract.js';
import { KafkaQueue } from '../src/main/typescript/KafkaQueue.js';

describe('Kafka DAOs Integration', () => {
  let queue: KafkaQueue;

  beforeAll(async () => {
    try {
      execSync('docker rm -f agent-mesh-kafka-test', { stdio: 'ignore' });
    } catch { /* ignore */ }

    execSync(
      'docker run -d --name agent-mesh-kafka-test -p 9092:9092 ' +
      '-e KAFKA_NODE_ID=1 -e KAFKA_PROCESS_ROLES=broker,controller ' +
      '-e KAFKA_CONTROLLER_QUORUM_VOTERS=1@localhost:9093 ' +
      '-e KAFKA_LISTENERS=PLAINTEXT://0.0.0.0:9092,CONTROLLER://0.0.0.0:9093 ' +
      '-e KAFKA_ADVERTISED_LISTENERS=PLAINTEXT://localhost:9092 ' +
      '-e KAFKA_LISTENER_SECURITY_PROTOCOL_MAP=PLAINTEXT:PLAINTEXT,CONTROLLER:PLAINTEXT ' +
      '-e KAFKA_CONTROLLER_LISTENER_NAMES=CONTROLLER ' +
      'apache/kafka:4.0.0',
    );

    // Wait for Kafka to be ready
    for (let i = 0; i < 60; i++) {
      try {
        const admin = new Kafka({
          clientId: 'test-probe',
          brokers: ['localhost:9092'],
          logLevel: logLevel.NOTHING,
        }).admin();
        await admin.connect();
        await admin.listTopics();
        await admin.disconnect();
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    queue = new KafkaQueue({
      brokers: ['localhost:9092'],
      groupId: 'agentmesh-test',
    });
    await queue.connect();
  }, 180000);

  afterAll(async () => {
    if (queue) await queue.disconnect();
    try {
      execSync('docker rm -f agent-mesh-kafka-test', { stdio: 'ignore' });
    } catch { /* ignore */ }
  });

  const cleanup = async () => {
    // Flush all known topics
    const topics = Object.keys(queue as any);
    for (const topic of topics) {
      try {
        await queue.flush(topic);
      } catch { /* ignore */ }
    }
  };

  runQueueDAOContractTests(async () => queue, cleanup);
});
