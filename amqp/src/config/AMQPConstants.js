"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AMQPConstants = void 0;
class AMQPConstants {
  static AMQP_QUEUE_TYPE = "amqp_queue";
  static AMQP_EXCHANGE_TYPE = "amqp_exchange";
  static DEFAULT_CONTENT_TYPE = "application/json";
  static DEFAULT_CONTENT_ENCODING = "UTF-8";
  static DEFAULT_EXCHANGE_TYPE = "topic";
  static DEFAULT_DURABLE = true;
  static DEFAULT_EXCLUSIVE = false;
  static DEFAULT_AUTO_DELETE = false;
  static DEFAULT_DELIVERY_MODE = 2;
  static DEFAULT_BATCH_SIZE = 1;
  static DEFAULT_POLL_TIME_MS = 100;
}
exports.AMQPConstants = AMQPConstants;
