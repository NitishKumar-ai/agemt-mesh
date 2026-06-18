import * as amqplib from 'amqplib';
export declare enum ConnectionType {
  PUBLISHER = 'PUBLISHER',
  SUBSCRIBER = 'SUBSCRIBER',
}
export interface AMQPRetryPattern {
  continueOrPropagate(e: Error, retryIndex: number): void;
}
export declare class AMQPConnection {
  private static instance;
  private static retrySettings;
  private publisherConnection;
  private subscriberConnection;
  private readonly connectionUrl;
  private availableChannelPool;
  private subscriberReservedChannelPool;
  private constructor();
  static getInstance(
    connectionUrl: string,
    retrySettings?: AMQPRetryPattern | null,
  ): AMQPConnection;
  static setAMQPConnection(amqpConnection: AMQPConnection): void;
  private createConnection;
  getOrCreateChannel(
    connectionType: ConnectionType,
    queueOrExchangeName: string,
  ): Promise<amqplib.Channel>;
  private createChannel;
  private borrowChannel;
  returnChannel(connectionType: ConnectionType, channel: amqplib.Channel): Promise<void>;
  close(): Promise<void>;
}
//# sourceMappingURL=AMQPConnection.d.ts.map
