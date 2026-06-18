export declare enum Type {
  QUEUE = 'amqp_queue',
  EXCHANGE = 'amqp_exchange',
}
export declare class AMQPSettings {
  private static readonly URI_PATTERN;
  type: Type;
  queueOrExchangeName: string;
  eventName: string;
  exchangeType: string;
  exchangeBoundQueueName: string;
  queueType: string;
  routingKey: string;
  contentEncoding: string;
  contentType: string;
  durable: boolean;
  exclusive: boolean;
  autoDelete: boolean;
  sequentialProcessing: boolean;
  deliveryMode: number;
  arguments: Record<string, any>;
  constructor();
  setDeliveryMode(deliveryMode: number): this;
  getExchangeBoundQueueName(): string;
  fromURI(queueURI: string): this;
}
//# sourceMappingURL=AMQPSettings.d.ts.map
