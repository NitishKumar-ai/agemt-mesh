import * as amqplib from "amqplib";

export enum ConnectionType {
  PUBLISHER = "PUBLISHER",
  SUBSCRIBER = "SUBSCRIBER",
}

export interface AMQPRetryPattern {
  continueOrPropagate(e: Error, retryIndex: number): void;
}

export class AMQPConnection {
  private static instance: AMQPConnection | null = null;
  private static retrySettings: AMQPRetryPattern | null = null;

  private publisherConnection: amqplib.ChannelModel | null = null;
  private subscriberConnection: amqplib.ChannelModel | null = null;

  private readonly connectionUrl: string;

  private availableChannelPool = new Map<
    ConnectionType,
    Set<amqplib.Channel>
  >();
  private subscriberReservedChannelPool = new Map<string, amqplib.Channel>();

  private constructor(connectionUrl: string) {
    this.connectionUrl = connectionUrl;
  }

  public static getInstance(
    connectionUrl: string,
    retrySettings: AMQPRetryPattern | null = null,
  ): AMQPConnection {
    if (!AMQPConnection.instance) {
      AMQPConnection.instance = new AMQPConnection(connectionUrl);
    }
    AMQPConnection.retrySettings = retrySettings;
    return AMQPConnection.instance;
  }

  public static setAMQPConnection(amqpConnection: AMQPConnection): void {
    AMQPConnection.instance = amqpConnection;
  }

  private async createConnection(
    connectionPrefix: string,
  ): Promise<amqplib.ChannelModel> {
    let retryIndex = 1;
    while (true) {
      try {
        const connection = await amqplib.connect(this.connectionUrl, {
          clientProperties: { connection_name: connectionPrefix },
        });

        connection.on("error", (err) => {
          console.error(`Connection error for ${connectionPrefix}:`, err);
        });

        connection.on("close", () => {
          console.error(`Connection closed for ${connectionPrefix}`);
        });

        return connection;
      } catch (e: any) {
        if (!AMQPConnection.retrySettings) {
          throw new Error(`Failed to open connection: ${e.message}`);
        }
        try {
          AMQPConnection.retrySettings.continueOrPropagate(e, retryIndex);
        } catch (ex) {
          throw new Error(
            `Retries completed. Failed to open connection: ${e.message}`,
          );
        }
        retryIndex++;
      }
    }
  }

  public async getOrCreateChannel(
    connectionType: ConnectionType,
    queueOrExchangeName: string,
  ): Promise<amqplib.Channel> {
    if (connectionType === ConnectionType.SUBSCRIBER) {
      const subChnName = `${connectionType};${queueOrExchangeName}`;
      const locChn = this.subscriberReservedChannelPool.get(subChnName);
      // In amqplib, channels emit 'close' or 'error' but there's no synchronous isOpen().
      // We'll assume if it's in the pool, it's usable, until we add close handlers.
      if (locChn) {
        return locChn;
      }
      if (!this.subscriberConnection) {
        this.subscriberConnection = await this.createConnection(
          ConnectionType.SUBSCRIBER,
        );
      }
      const subChn = await this.borrowChannel(
        connectionType,
        this.subscriberConnection,
      );
      this.subscriberReservedChannelPool.set(subChnName, subChn);
      return subChn;
    } else {
      if (!this.publisherConnection) {
        this.publisherConnection = await this.createConnection(
          ConnectionType.PUBLISHER,
        );
      }
      return await this.borrowChannel(connectionType, this.publisherConnection);
    }
  }

  private async createChannel(
    connType: ConnectionType,
    rmqConnection: amqplib.ChannelModel,
  ): Promise<amqplib.Channel> {
    let retryIndex = 1;
    while (true) {
      try {
        const locChn = await rmqConnection.createChannel();
        locChn.on("close", () => {
          console.error(`${connType} Channel has been closed`);
        });
        locChn.on("error", (err) => {
          console.error(`${connType} Channel has error:`, err);
        });
        return locChn;
      } catch (e: any) {
        if (!AMQPConnection.retrySettings) {
          throw new Error(`Cannot open ${connType} channel: ${e.message}`);
        }
        try {
          AMQPConnection.retrySettings.continueOrPropagate(e, retryIndex);
        } catch (ex) {
          throw new Error(
            `Retries completed. Cannot open ${connType} channel: ${e.message}`,
          );
        }
        retryIndex++;
      }
    }
  }

  private async borrowChannel(
    connectionType: ConnectionType,
    rmqConnection: amqplib.ChannelModel,
  ): Promise<amqplib.Channel> {
    let channels = this.availableChannelPool.get(connectionType);
    if (!channels) {
      channels = new Set<amqplib.Channel>();
      this.availableChannelPool.set(connectionType, channels);
    }

    if (channels.size > 0) {
      const channel = channels.values().next().value as amqplib.Channel;
      channels.delete(channel);
      return channel;
    }

    return await this.createChannel(connectionType, rmqConnection);
  }

  public async returnChannel(
    connectionType: ConnectionType,
    channel: amqplib.Channel,
  ): Promise<void> {
    if (!channel) {
      return;
    }
    let channels = this.availableChannelPool.get(connectionType);
    if (!channels) {
      channels = new Set<amqplib.Channel>();
      this.availableChannelPool.set(connectionType, channels);
    }
    channels.add(channel);
  }

  public async close(): Promise<void> {
    console.log("Closing all connections and channels");
    this.availableChannelPool.clear();
    this.subscriberReservedChannelPool.clear();

    if (this.publisherConnection) {
      try {
        await this.publisherConnection.close();
      } catch (e) {
        console.warn("Failed to close publisher connection", e);
      }
    }
    if (this.subscriberConnection) {
      try {
        await this.subscriberConnection.close();
      } catch (e) {
        console.warn("Failed to close subscriber connection", e);
      }
    }
    this.publisherConnection = null;
    this.subscriberConnection = null;
  }
}
