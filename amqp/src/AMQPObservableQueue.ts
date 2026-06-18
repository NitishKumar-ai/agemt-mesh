import { Buffer } from 'buffer';
import { Observable, Subscriber, interval } from 'rxjs';
import { concatMap } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';
import * as amqplib from 'amqplib';
import { Message } from './core/Message';
import { ObservableQueue } from './core/ObservableQueue';
import { AMQPSettings, Type } from './config/AMQPSettings';
import { AMQPConnection, ConnectionType, AMQPRetryPattern } from './AMQPConnection';

export class AMQPObservableQueue implements ObservableQueue {
  private readonly settings: AMQPSettings;
  private readonly retrySettings: AMQPRetryPattern | null;
  private readonly batchSize: number;
  private readonly useExchange: boolean;
  private readonly pollTimeInMS: number;
  private readonly amqpConnection: AMQPConnection;

  private messages: Message[] = [];
  private running: boolean = false;

  constructor(
    connectionUrl: string,
    useExchange: boolean,
    settings: AMQPSettings,
    retrySettings: AMQPRetryPattern | null,
    batchSize: number,
    pollTimeInMS: number,
  ) {
    if (!settings) throw new Error('Settings are undefined');
    if (batchSize <= 0) throw new Error('Batch size must be greater than 0');
    if (pollTimeInMS <= 0) throw new Error('Poll time must be greater than 0 ms');

    this.useExchange = useExchange;
    this.settings = settings;
    this.batchSize = batchSize;
    this.retrySettings = retrySettings;
    this.pollTimeInMS = pollTimeInMS;
    this.amqpConnection = AMQPConnection.getInstance(connectionUrl, retrySettings);
  }

  public observe(): Observable<Message> {
    return new Observable<Message>((subscriber) => {
      if (this.settings.sequentialProcessing) {
        console.log('Subscribing for the message processing on schedule basis');
        this.receiveMessages().catch((e) => subscriber.error(e));

        const subscription = interval(this.pollTimeInMS).subscribe(async () => {
          if (!this.isRunning()) {
            console.debug('Component stopped, skip listening for messages');
            return;
          }
          if (this.messages.length > 0) {
            const batch = this.messages.splice(0, this.messages.length);
            console.log(
              `Batch from ${this.settings.queueOrExchangeName} is ${batch.map((b) => b.id).join(',')}`,
            );
            for (const msg of batch) {
              subscriber.next(msg);
            }
          }
        });

        return () => subscription.unsubscribe();
      } else {
        console.log('Subscribing for the event based AMQP message processing');
        this.receiveMessagesWithSubscriber(subscriber).catch((e) => subscriber.error(e));
        console.log('Subscribed for the event based AMQP message processing');
      }
    });
  }

  public getType(): string {
    return this.useExchange ? 'amqp_exchange' : 'amqp_queue';
  }

  public getName(): string {
    return this.settings.eventName;
  }

  public getURI(): string {
    return this.settings.queueOrExchangeName;
  }

  public async ack(messages: Message[]): Promise<string[]> {
    const failedMessages: string[] = [];
    if (!this.useExchange) {
      for (const message of messages) {
        try {
          await this.ackMsg(message);
        } catch (e: any) {
          console.error(`Cannot ACK message with delivery tag ${message.receipt}`, e);
          if (message.receipt) failedMessages.push(message.receipt);
        }
      }
    }
    return failedMessages;
  }

  private async ackMsg(message: Message): Promise<void> {
    let retryIndex = 1;
    while (true) {
      try {
        const chn = await this.amqpConnection.getOrCreateChannel(
          ConnectionType.SUBSCRIBER,
          this.settings.queueOrExchangeName,
        );
        if (message.receipt) {
          chn.ack({ fields: { deliveryTag: parseInt(message.receipt, 10) } } as any, false);
        }
        break;
      } catch (e: any) {
        if (!this.retrySettings) throw e;
        try {
          this.retrySettings.continueOrPropagate(e, retryIndex);
        } catch (ex) {
          throw ex;
        }
        retryIndex++;
      }
    }
  }

  public async publish(messages: Message[]): Promise<void> {
    try {
      let exchange = '';
      let routingKey = '';
      if (this.useExchange) {
        await this.getOrCreateExchange(ConnectionType.PUBLISHER);
        exchange = this.settings.queueOrExchangeName;
        routingKey = this.settings.routingKey;
      } else {
        const q = await this.getOrCreateQueue(ConnectionType.PUBLISHER);
        exchange = '';
        routingKey = q.queue;
      }

      for (const message of messages) {
        await this.publishMessage(message, exchange, routingKey);
      }
    } catch (ex) {
      console.error('Failed to publish messages:', ex);
      throw ex;
    }
  }

  private async publishMessage(
    message: Message,
    exchange: string,
    routingKey: string,
  ): Promise<void> {
    let chn: amqplib.Channel | null = null;
    let retryIndex = 1;
    while (true) {
      try {
        const payload = message.payload;
        chn = await this.amqpConnection.getOrCreateChannel(
          ConnectionType.PUBLISHER,
          this.settings.queueOrExchangeName,
        );

        const messageId = message.id || uuidv4();
        const correlationId = message.receipt || uuidv4();

        chn.publish(
          exchange,
          routingKey,
          Buffer.from(payload, this.settings.contentEncoding as any),
          {
            messageId,
            correlationId,
            contentType: this.settings.contentType,
            contentEncoding: this.settings.contentEncoding,
            deliveryMode: this.settings.deliveryMode,
          },
        );
        console.log(`Published message to ${exchange}: ${payload}`);
        break;
      } catch (ex: any) {
        if (!this.retrySettings) throw ex;
        try {
          this.retrySettings.continueOrPropagate(ex, retryIndex);
        } catch (e) {
          throw e;
        }
        retryIndex++;
      } finally {
        if (chn) {
          try {
            await this.amqpConnection.returnChannel(ConnectionType.PUBLISHER, chn);
          } catch (e) {
            console.error('Failed to return the channel', e);
          }
        }
      }
    }
  }

  public setUnackTimeout(message: Message, unackTimeout: number): void {
    throw new Error('UnsupportedOperationException');
  }

  public async size(): Promise<number> {
    let chn: amqplib.Channel | null = null;
    try {
      chn = await this.amqpConnection.getOrCreateChannel(
        ConnectionType.SUBSCRIBER,
        this.settings.queueOrExchangeName,
      );
      const target =
        this.settings.type === Type.EXCHANGE
          ? this.settings.getExchangeBoundQueueName()
          : this.settings.queueOrExchangeName;
      const q = await chn.checkQueue(target);
      return q.messageCount;
    } catch (e) {
      throw e;
    } finally {
      if (chn) {
        await this.amqpConnection.returnChannel(ConnectionType.SUBSCRIBER, chn);
      }
    }
  }

  public close(): void {
    this.amqpConnection.close();
  }

  public start(): void {
    this.running = true;
  }

  public stop(): void {
    this.running = false;
  }

  public isRunning(): boolean {
    return this.running;
  }

  private async getOrCreateExchange(
    connectionType: ConnectionType,
  ): Promise<amqplib.Replies.AssertExchange> {
    const chn = await this.amqpConnection.getOrCreateChannel(
      connectionType,
      this.settings.queueOrExchangeName,
    );
    const repl = await chn.assertExchange(
      this.settings.queueOrExchangeName,
      this.settings.exchangeType,
      {
        durable: this.settings.durable,
        autoDelete: this.settings.autoDelete,
        arguments: this.settings.arguments,
      },
    );
    await this.amqpConnection.returnChannel(connectionType, chn);
    return repl;
  }

  private async getOrCreateQueue(
    connectionType: ConnectionType,
    name?: string,
  ): Promise<amqplib.Replies.AssertQueue> {
    const targetName = name || this.settings.queueOrExchangeName;
    const chn = await this.amqpConnection.getOrCreateChannel(
      connectionType,
      this.settings.queueOrExchangeName,
    );
    const args = {
      ...this.settings.arguments,
      'x-queue-type': this.settings.queueType,
    };
    const repl = await chn.assertQueue(targetName, {
      durable: this.settings.durable,
      exclusive: this.settings.exclusive,
      autoDelete: this.settings.autoDelete,
      arguments: args,
    });
    await this.amqpConnection.returnChannel(connectionType, chn);
    return repl;
  }

  private async receiveMessagesWithSubscriber(subscriber: Subscriber<Message>): Promise<void> {
    const chn = await this.amqpConnection.getOrCreateChannel(
      ConnectionType.SUBSCRIBER,
      this.settings.queueOrExchangeName,
    );
    await chn.prefetch(this.batchSize);

    let queueName = '';
    if (this.useExchange) {
      await this.getOrCreateExchange(ConnectionType.SUBSCRIBER);
      const q = await this.getOrCreateQueue(
        ConnectionType.SUBSCRIBER,
        this.settings.getExchangeBoundQueueName(),
      );
      queueName = q.queue;
      await chn.bindQueue(queueName, this.settings.queueOrExchangeName, this.settings.routingKey);
    } else {
      const q = await this.getOrCreateQueue(ConnectionType.SUBSCRIBER);
      queueName = q.queue;
    }

    await chn.consume(
      queueName,
      (msg) => {
        if (msg) {
          const message: Message = {
            id: msg.properties.messageId || uuidv4(),
            receipt: msg.fields.deliveryTag.toString(),
            payload: msg.content.toString(this.settings.contentEncoding as any),
          };
          subscriber.next(message);
        }
      },
      { noAck: false },
    );
  }

  private async receiveMessages(): Promise<void> {
    const chn = await this.amqpConnection.getOrCreateChannel(
      ConnectionType.SUBSCRIBER,
      this.settings.queueOrExchangeName,
    );
    await chn.prefetch(this.batchSize);

    let queueName = '';
    if (this.useExchange) {
      await this.getOrCreateExchange(ConnectionType.SUBSCRIBER);
      const q = await this.getOrCreateQueue(
        ConnectionType.SUBSCRIBER,
        this.settings.getExchangeBoundQueueName(),
      );
      queueName = q.queue;
      await chn.bindQueue(queueName, this.settings.queueOrExchangeName, this.settings.routingKey);
    } else {
      const q = await this.getOrCreateQueue(ConnectionType.SUBSCRIBER);
      queueName = q.queue;
    }

    await chn.consume(
      queueName,
      (msg) => {
        if (msg) {
          const message: Message = {
            id: msg.properties.messageId || uuidv4(),
            receipt: msg.fields.deliveryTag.toString(),
            payload: msg.content.toString(this.settings.contentEncoding as any),
          };
          this.messages.push(message);
        }
      },
      { noAck: false },
    );
  }
}
