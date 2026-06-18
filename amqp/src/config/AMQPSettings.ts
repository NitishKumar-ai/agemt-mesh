import { AMQPConstants } from "./AMQPConstants";

export enum Type {
  QUEUE = "amqp_queue",
  EXCHANGE = "amqp_exchange",
}

export class AMQPSettings {
  private static readonly URI_PATTERN =
    /^(amqp_(?:queue|exchange))?:?([^?]+)\??(.*)$/i;

  public type: Type = Type.QUEUE;
  public queueOrExchangeName: string = "";
  public eventName: string = "";
  public exchangeType: string = AMQPConstants.DEFAULT_EXCHANGE_TYPE;
  public exchangeBoundQueueName: string = "";
  public queueType: string = "classic";
  public routingKey: string = "";
  public contentEncoding: string = AMQPConstants.DEFAULT_CONTENT_ENCODING;
  public contentType: string = AMQPConstants.DEFAULT_CONTENT_TYPE;
  public durable: boolean = AMQPConstants.DEFAULT_DURABLE;
  public exclusive: boolean = AMQPConstants.DEFAULT_EXCLUSIVE;
  public autoDelete: boolean = AMQPConstants.DEFAULT_AUTO_DELETE;
  public sequentialProcessing: boolean = false;
  public deliveryMode: number = AMQPConstants.DEFAULT_DELIVERY_MODE;
  public arguments: Record<string, any> = {};

  constructor() {}

  public setDeliveryMode(deliveryMode: number): this {
    if (deliveryMode !== 1 && deliveryMode !== 2) {
      throw new Error("Delivery mode must be 1 or 2");
    }
    this.deliveryMode = deliveryMode;
    return this;
  }

  public getExchangeBoundQueueName(): string {
    if (!this.exchangeBoundQueueName) {
      return `bound_to_${this.queueOrExchangeName}`;
    }
    return this.exchangeBoundQueueName;
  }

  public fromURI(queueURI: string): this {
    const match = queueURI.match(AMQPSettings.URI_PATTERN);
    if (!match) {
      throw new Error("Queue URI doesn't match the expected regexp");
    }

    if (match[1]) {
      this.type =
        match[1].toLowerCase() === Type.EXCHANGE ? Type.EXCHANGE : Type.QUEUE;
    }
    this.queueOrExchangeName = match[2];
    this.eventName = queueURI;

    if (match[3]) {
      const queryParams = match[3];
      const params = queryParams.split("&");
      for (const param of params) {
        const [key, value] = param.split("=");
        if (key && value) {
          const lkey = key.toLowerCase();
          if (lkey === "exchangetype") {
            this.exchangeType = value;
          } else if (lkey === "queuename" || lkey === "bindqueuename") {
            this.exchangeBoundQueueName = value;
          } else if (lkey === "routingkey") {
            this.routingKey = value;
          } else if (lkey === "durable") {
            this.durable = value.toLowerCase() === "true";
          } else if (lkey === "exclusive") {
            this.exclusive = value.toLowerCase() === "true";
          } else if (lkey === "autodelete") {
            this.autoDelete = value.toLowerCase() === "true";
          } else if (lkey === "deliverymode") {
            this.setDeliveryMode(parseInt(value, 10));
          } else if (lkey === "maxpriority") {
            this.arguments["x-max-priority"] = parseInt(value, 10);
          }
        }
      }
    }
    return this;
  }
}
