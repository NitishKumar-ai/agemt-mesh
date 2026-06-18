"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AMQPObservableQueue = void 0;
const buffer_1 = require("buffer");
const rxjs_1 = require("rxjs");
const uuid_1 = require("uuid");
const AMQPSettings_1 = require("./config/AMQPSettings");
const AMQPConnection_1 = require("./AMQPConnection");
class AMQPObservableQueue {
  settings;
  retrySettings;
  batchSize;
  useExchange;
  pollTimeInMS;
  amqpConnection;
  messages = [];
  running = false;
  constructor(
    connectionUrl,
    useExchange,
    settings,
    retrySettings,
    batchSize,
    pollTimeInMS,
  ) {
    if (!settings) throw new Error("Settings are undefined");
    if (batchSize <= 0) throw new Error("Batch size must be greater than 0");
    if (pollTimeInMS <= 0)
      throw new Error("Poll time must be greater than 0 ms");
    this.useExchange = useExchange;
    this.settings = settings;
    this.batchSize = batchSize;
    this.retrySettings = retrySettings;
    this.pollTimeInMS = pollTimeInMS;
    this.amqpConnection = AMQPConnection_1.AMQPConnection.getInstance(
      connectionUrl,
      retrySettings,
    );
  }
  observe() {
    return new rxjs_1.Observable((subscriber) => {
      if (this.settings.sequentialProcessing) {
        console.log("Subscribing for the message processing on schedule basis");
        this.receiveMessages().catch((e) => subscriber.error(e));
        const subscription = (0, rxjs_1.interval)(this.pollTimeInMS).subscribe(
          async () => {
            if (!this.isRunning()) {
              console.debug("Component stopped, skip listening for messages");
              return;
            }
            if (this.messages.length > 0) {
              const batch = this.messages.splice(0, this.messages.length);
              console.log(
                `Batch from ${this.settings.queueOrExchangeName} is ${batch.map((b) => b.id).join(",")}`,
              );
              for (const msg of batch) {
                subscriber.next(msg);
              }
            }
          },
        );
        return () => subscription.unsubscribe();
      } else {
        console.log("Subscribing for the event based AMQP message processing");
        this.receiveMessagesWithSubscriber(subscriber).catch((e) =>
          subscriber.error(e),
        );
        console.log("Subscribed for the event based AMQP message processing");
      }
    });
  }
  getType() {
    return this.useExchange ? "amqp_exchange" : "amqp_queue";
  }
  getName() {
    return this.settings.eventName;
  }
  getURI() {
    return this.settings.queueOrExchangeName;
  }
  async ack(messages) {
    const failedMessages = [];
    if (!this.useExchange) {
      for (const message of messages) {
        try {
          await this.ackMsg(message);
        } catch (e) {
          console.error(
            `Cannot ACK message with delivery tag ${message.receipt}`,
            e,
          );
          if (message.receipt) failedMessages.push(message.receipt);
        }
      }
    }
    return failedMessages;
  }
  async ackMsg(message) {
    let retryIndex = 1;
    while (true) {
      try {
        const chn = await this.amqpConnection.getOrCreateChannel(
          AMQPConnection_1.ConnectionType.SUBSCRIBER,
          this.settings.queueOrExchangeName,
        );
        if (message.receipt) {
          chn.ack(
            { fields: { deliveryTag: parseInt(message.receipt, 10) } },
            false,
          );
        }
        break;
      } catch (e) {
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
  async publish(messages) {
    try {
      let exchange = "";
      let routingKey = "";
      if (this.useExchange) {
        await this.getOrCreateExchange(
          AMQPConnection_1.ConnectionType.PUBLISHER,
        );
        exchange = this.settings.queueOrExchangeName;
        routingKey = this.settings.routingKey;
      } else {
        const q = await this.getOrCreateQueue(
          AMQPConnection_1.ConnectionType.PUBLISHER,
        );
        exchange = "";
        routingKey = q.queue;
      }
      for (const message of messages) {
        await this.publishMessage(message, exchange, routingKey);
      }
    } catch (ex) {
      console.error("Failed to publish messages:", ex);
      throw ex;
    }
  }
  async publishMessage(message, exchange, routingKey) {
    let chn = null;
    let retryIndex = 1;
    while (true) {
      try {
        const payload = message.payload;
        chn = await this.amqpConnection.getOrCreateChannel(
          AMQPConnection_1.ConnectionType.PUBLISHER,
          this.settings.queueOrExchangeName,
        );
        const messageId = message.id || (0, uuid_1.v4)();
        const correlationId = message.receipt || (0, uuid_1.v4)();
        chn.publish(
          exchange,
          routingKey,
          buffer_1.Buffer.from(payload, this.settings.contentEncoding),
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
      } catch (ex) {
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
            await this.amqpConnection.returnChannel(
              AMQPConnection_1.ConnectionType.PUBLISHER,
              chn,
            );
          } catch (e) {
            console.error("Failed to return the channel", e);
          }
        }
      }
    }
  }
  setUnackTimeout(message, unackTimeout) {
    throw new Error("UnsupportedOperationException");
  }
  async size() {
    let chn = null;
    try {
      chn = await this.amqpConnection.getOrCreateChannel(
        AMQPConnection_1.ConnectionType.SUBSCRIBER,
        this.settings.queueOrExchangeName,
      );
      const target =
        this.settings.type === AMQPSettings_1.Type.EXCHANGE
          ? this.settings.getExchangeBoundQueueName()
          : this.settings.queueOrExchangeName;
      const q = await chn.checkQueue(target);
      return q.messageCount;
    } catch (e) {
      throw e;
    } finally {
      if (chn) {
        await this.amqpConnection.returnChannel(
          AMQPConnection_1.ConnectionType.SUBSCRIBER,
          chn,
        );
      }
    }
  }
  close() {
    this.amqpConnection.close();
  }
  start() {
    this.running = true;
  }
  stop() {
    this.running = false;
  }
  isRunning() {
    return this.running;
  }
  async getOrCreateExchange(connectionType) {
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
  async getOrCreateQueue(connectionType, name) {
    const targetName = name || this.settings.queueOrExchangeName;
    const chn = await this.amqpConnection.getOrCreateChannel(
      connectionType,
      this.settings.queueOrExchangeName,
    );
    const args = {
      ...this.settings.arguments,
      "x-queue-type": this.settings.queueType,
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
  async receiveMessagesWithSubscriber(subscriber) {
    const chn = await this.amqpConnection.getOrCreateChannel(
      AMQPConnection_1.ConnectionType.SUBSCRIBER,
      this.settings.queueOrExchangeName,
    );
    await chn.prefetch(this.batchSize);
    let queueName = "";
    if (this.useExchange) {
      await this.getOrCreateExchange(
        AMQPConnection_1.ConnectionType.SUBSCRIBER,
      );
      const q = await this.getOrCreateQueue(
        AMQPConnection_1.ConnectionType.SUBSCRIBER,
        this.settings.getExchangeBoundQueueName(),
      );
      queueName = q.queue;
      await chn.bindQueue(
        queueName,
        this.settings.queueOrExchangeName,
        this.settings.routingKey,
      );
    } else {
      const q = await this.getOrCreateQueue(
        AMQPConnection_1.ConnectionType.SUBSCRIBER,
      );
      queueName = q.queue;
    }
    await chn.consume(
      queueName,
      (msg) => {
        if (msg) {
          const message = {
            id: msg.properties.messageId || (0, uuid_1.v4)(),
            receipt: msg.fields.deliveryTag.toString(),
            payload: msg.content.toString(this.settings.contentEncoding),
          };
          subscriber.next(message);
        }
      },
      { noAck: false },
    );
  }
  async receiveMessages() {
    const chn = await this.amqpConnection.getOrCreateChannel(
      AMQPConnection_1.ConnectionType.SUBSCRIBER,
      this.settings.queueOrExchangeName,
    );
    await chn.prefetch(this.batchSize);
    let queueName = "";
    if (this.useExchange) {
      await this.getOrCreateExchange(
        AMQPConnection_1.ConnectionType.SUBSCRIBER,
      );
      const q = await this.getOrCreateQueue(
        AMQPConnection_1.ConnectionType.SUBSCRIBER,
        this.settings.getExchangeBoundQueueName(),
      );
      queueName = q.queue;
      await chn.bindQueue(
        queueName,
        this.settings.queueOrExchangeName,
        this.settings.routingKey,
      );
    } else {
      const q = await this.getOrCreateQueue(
        AMQPConnection_1.ConnectionType.SUBSCRIBER,
      );
      queueName = q.queue;
    }
    await chn.consume(
      queueName,
      (msg) => {
        if (msg) {
          const message = {
            id: msg.properties.messageId || (0, uuid_1.v4)(),
            receipt: msg.fields.deliveryTag.toString(),
            payload: msg.content.toString(this.settings.contentEncoding),
          };
          this.messages.push(message);
        }
      },
      { noAck: false },
    );
  }
}
exports.AMQPObservableQueue = AMQPObservableQueue;
