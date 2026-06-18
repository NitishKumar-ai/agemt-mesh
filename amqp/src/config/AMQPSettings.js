'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.AMQPSettings = exports.Type = void 0;
const AMQPConstants_1 = require('./AMQPConstants');
var Type;
(function (Type) {
  Type['QUEUE'] = 'amqp_queue';
  Type['EXCHANGE'] = 'amqp_exchange';
})(Type || (exports.Type = Type = {}));
class AMQPSettings {
  static URI_PATTERN = /^(amqp_(?:queue|exchange))?:?([^?]+)\??(.*)$/i;
  type = Type.QUEUE;
  queueOrExchangeName = '';
  eventName = '';
  exchangeType = AMQPConstants_1.AMQPConstants.DEFAULT_EXCHANGE_TYPE;
  exchangeBoundQueueName = '';
  queueType = 'classic';
  routingKey = '';
  contentEncoding = AMQPConstants_1.AMQPConstants.DEFAULT_CONTENT_ENCODING;
  contentType = AMQPConstants_1.AMQPConstants.DEFAULT_CONTENT_TYPE;
  durable = AMQPConstants_1.AMQPConstants.DEFAULT_DURABLE;
  exclusive = AMQPConstants_1.AMQPConstants.DEFAULT_EXCLUSIVE;
  autoDelete = AMQPConstants_1.AMQPConstants.DEFAULT_AUTO_DELETE;
  sequentialProcessing = false;
  deliveryMode = AMQPConstants_1.AMQPConstants.DEFAULT_DELIVERY_MODE;
  arguments = {};
  constructor() {}
  setDeliveryMode(deliveryMode) {
    if (deliveryMode !== 1 && deliveryMode !== 2) {
      throw new Error('Delivery mode must be 1 or 2');
    }
    this.deliveryMode = deliveryMode;
    return this;
  }
  getExchangeBoundQueueName() {
    if (!this.exchangeBoundQueueName) {
      return `bound_to_${this.queueOrExchangeName}`;
    }
    return this.exchangeBoundQueueName;
  }
  fromURI(queueURI) {
    const match = queueURI.match(AMQPSettings.URI_PATTERN);
    if (!match) {
      throw new Error("Queue URI doesn't match the expected regexp");
    }
    if (match[1]) {
      this.type = match[1].toLowerCase() === Type.EXCHANGE ? Type.EXCHANGE : Type.QUEUE;
    }
    this.queueOrExchangeName = match[2];
    this.eventName = queueURI;
    if (match[3]) {
      const queryParams = match[3];
      const params = queryParams.split('&');
      for (const param of params) {
        const [key, value] = param.split('=');
        if (key && value) {
          const lkey = key.toLowerCase();
          if (lkey === 'exchangetype') {
            this.exchangeType = value;
          } else if (lkey === 'queuename' || lkey === 'bindqueuename') {
            this.exchangeBoundQueueName = value;
          } else if (lkey === 'routingkey') {
            this.routingKey = value;
          } else if (lkey === 'durable') {
            this.durable = value.toLowerCase() === 'true';
          } else if (lkey === 'exclusive') {
            this.exclusive = value.toLowerCase() === 'true';
          } else if (lkey === 'autodelete') {
            this.autoDelete = value.toLowerCase() === 'true';
          } else if (lkey === 'deliverymode') {
            this.setDeliveryMode(parseInt(value, 10));
          } else if (lkey === 'maxpriority') {
            this.arguments['x-max-priority'] = parseInt(value, 10);
          }
        }
      }
    }
    return this;
  }
}
exports.AMQPSettings = AMQPSettings;
