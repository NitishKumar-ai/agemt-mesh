import { QueueDAO } from '@agentmesh/common-persistence';
import { Message } from '@agentmesh/common';
import { AMQPConnection, ConnectionType } from './AMQPConnection.js';
import { AMQPSettings, Type } from './config/AMQPSettings.js';
import { Buffer } from 'buffer';

/**
 * AMQPQueueDAO implements the QueueDAO interface using a Hybrid Bridge pattern.
 * It writes state changes and logs transactionally to a delegate database QueueDAO
 * and dispatches task signaling/routing events over AMQP (RabbitMQ) to enable low-latency,
 * distributed task consumption.
 */
export class AMQPQueueDAO implements QueueDAO {
  private readonly amqpConnection: AMQPConnection;

  constructor(
    private readonly delegate: QueueDAO,
    private readonly connectionUrl: string,
  ) {
    this.amqpConnection = AMQPConnection.getInstance(connectionUrl, null);
  }

  private getAMQPSettings(queueName: string): AMQPSettings {
    const settings = new AMQPSettings();
    settings.fromURI(queueName);
    return settings;
  }

  async push(
    queueName: string,
    id: string,
    offsetTimeInSecond: number,
    priority: number = 0,
  ): Promise<void> {
    // 1. Transactionally record the push in the database delegate
    await this.delegate.push(queueName, id, offsetTimeInSecond, priority);

    // 2. Publish to RabbitMQ exchange or queue
    const settings = this.getAMQPSettings(queueName);
    const channel = await this.amqpConnection.getOrCreateChannel(ConnectionType.PUBLISHER, queueName);
    try {
      const payload = Buffer.from(JSON.stringify({ id, queueName, priority }));
      
      if (settings.type === Type.EXCHANGE) {
        await channel.assertExchange(settings.queueOrExchangeName, settings.exchangeType, {
          durable: settings.durable,
          autoDelete: settings.autoDelete,
        });
        channel.publish(settings.queueOrExchangeName, settings.routingKey, payload, {
          deliveryMode: settings.deliveryMode,
        });
      } else {
        await channel.assertQueue(settings.queueOrExchangeName, {
          durable: settings.durable,
          exclusive: settings.exclusive,
          autoDelete: settings.autoDelete,
          arguments: settings.arguments,
        });
        channel.sendToQueue(settings.queueOrExchangeName, payload, {
          deliveryMode: settings.deliveryMode,
        });
      }
    } finally {
      await this.amqpConnection.returnChannel(ConnectionType.PUBLISHER, channel);
    }
  }

  async pushMessages(queueName: string, messages: Message[]): Promise<void> {
    await this.delegate.pushMessages(queueName, messages);
    for (const msg of messages) {
      if (msg.id) {
        await this.push(queueName, msg.id, 0);
      }
    }
  }

  async pushIfNotExists(
    queueName: string,
    id: string,
    offsetTimeInSecond: number,
    priority?: number,
  ): Promise<boolean> {
    const result = await this.delegate.pushIfNotExists(queueName, id, offsetTimeInSecond, priority);
    if (result) {
      await this.push(queueName, id, offsetTimeInSecond, priority);
    }
    return result;
  }

  async pop(queueName: string, count: number, timeout: number): Promise<string[]> {
    // For popping, we retrieve the messages transactionally from the database queue to ensure
    // thread-safety and FIFO constraints, aligning with the hybrid database model.
    return await this.delegate.pop(queueName, count, timeout);
  }

  async pollMessages(queueName: string, count: number, timeout: number): Promise<Message[]> {
    return await this.delegate.pollMessages(queueName, count, timeout);
  }

  async remove(queueName: string, messageId: string): Promise<void> {
    await this.delegate.remove(queueName, messageId);
  }

  async getSize(queueName: string): Promise<number> {
    return await this.delegate.getSize(queueName);
  }

  async ack(queueName: string, messageId: string): Promise<boolean> {
    return await this.delegate.ack(queueName, messageId);
  }

  async setUnackTimeout(
    queueName: string,
    messageId: string,
    unackTimeout: number,
  ): Promise<boolean> {
    return await this.delegate.setUnackTimeout(queueName, messageId, unackTimeout);
  }

  async setUnackTimeoutIfShorter(
    queueName: string,
    messageId: string,
    unackTimeout: number,
  ): Promise<boolean> {
    return await this.delegate.setUnackTimeoutIfShorter(queueName, messageId, unackTimeout);
  }

  async flush(queueName: string): Promise<void> {
    await this.delegate.flush(queueName);
  }

  async queuesDetail(): Promise<Record<string, number>> {
    return await this.delegate.queuesDetail();
  }

  async queuesDetailVerbose(): Promise<Record<string, Record<string, Record<string, number>>>> {
    return await this.delegate.queuesDetailVerbose();
  }

  async processUnacks(queueName: string): Promise<void> {
    await this.delegate.processUnacks(queueName);
  }

  async resetOffsetTime(queueName: string, id: string): Promise<boolean> {
    return await this.delegate.resetOffsetTime(queueName, id);
  }

  async postpone(
    queueName: string,
    messageId: string,
    priority: number,
    postponeDurationInSeconds: number,
  ): Promise<boolean> {
    return await this.delegate.postpone(queueName, messageId, priority, postponeDurationInSeconds);
  }

  async containsMessage(queueName: string, messageId: string): Promise<boolean> {
    return await this.delegate.containsMessage(queueName, messageId);
  }

  async peekFirstIds(queueName: string, count: number): Promise<string[]> {
    return await this.delegate.peekFirstIds(queueName, count);
  }
}
