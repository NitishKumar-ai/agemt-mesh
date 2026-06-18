export class AMQPConstants {
  public static readonly AMQP_QUEUE_TYPE = 'amqp_queue';
  public static readonly AMQP_EXCHANGE_TYPE = 'amqp_exchange';
  public static readonly DEFAULT_CONTENT_TYPE = 'application/json';
  public static readonly DEFAULT_CONTENT_ENCODING = 'UTF-8';
  public static readonly DEFAULT_EXCHANGE_TYPE = 'topic';
  public static readonly DEFAULT_DURABLE = true;
  public static readonly DEFAULT_EXCLUSIVE = false;
  public static readonly DEFAULT_AUTO_DELETE = false;
  public static readonly DEFAULT_DELIVERY_MODE = 2;
  public static readonly DEFAULT_BATCH_SIZE = 1;
  public static readonly DEFAULT_POLL_TIME_MS = 100;
}
