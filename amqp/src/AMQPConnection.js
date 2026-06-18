'use strict';
var __createBinding =
  (this && this.__createBinding) ||
  (Object.create
    ? function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        var desc = Object.getOwnPropertyDescriptor(m, k);
        if (!desc || ('get' in desc ? !m.__esModule : desc.writable || desc.configurable)) {
          desc = {
            enumerable: true,
            get: function () {
              return m[k];
            },
          };
        }
        Object.defineProperty(o, k2, desc);
      }
    : function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
      });
var __setModuleDefault =
  (this && this.__setModuleDefault) ||
  (Object.create
    ? function (o, v) {
        Object.defineProperty(o, 'default', { enumerable: true, value: v });
      }
    : function (o, v) {
        o['default'] = v;
      });
var __importStar =
  (this && this.__importStar) ||
  (function () {
    var ownKeys = function (o) {
      ownKeys =
        Object.getOwnPropertyNames ||
        function (o) {
          var ar = [];
          for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
          return ar;
        };
      return ownKeys(o);
    };
    return function (mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null)
        for (var k = ownKeys(mod), i = 0; i < k.length; i++)
          if (k[i] !== 'default') __createBinding(result, mod, k[i]);
      __setModuleDefault(result, mod);
      return result;
    };
  })();
Object.defineProperty(exports, '__esModule', { value: true });
exports.AMQPConnection = exports.ConnectionType = void 0;
const amqplib = __importStar(require('amqplib'));
var ConnectionType;
(function (ConnectionType) {
  ConnectionType['PUBLISHER'] = 'PUBLISHER';
  ConnectionType['SUBSCRIBER'] = 'SUBSCRIBER';
})(ConnectionType || (exports.ConnectionType = ConnectionType = {}));
class AMQPConnection {
  static instance = null;
  static retrySettings = null;
  publisherConnection = null;
  subscriberConnection = null;
  connectionUrl;
  availableChannelPool = new Map();
  subscriberReservedChannelPool = new Map();
  constructor(connectionUrl) {
    this.connectionUrl = connectionUrl;
  }
  static getInstance(connectionUrl, retrySettings = null) {
    if (!AMQPConnection.instance) {
      AMQPConnection.instance = new AMQPConnection(connectionUrl);
    }
    AMQPConnection.retrySettings = retrySettings;
    return AMQPConnection.instance;
  }
  static setAMQPConnection(amqpConnection) {
    AMQPConnection.instance = amqpConnection;
  }
  async createConnection(connectionPrefix) {
    let retryIndex = 1;
    while (true) {
      try {
        const connection = await amqplib.connect(this.connectionUrl, {
          clientProperties: { connection_name: connectionPrefix },
        });
        connection.on('error', (err) => {
          console.error(`Connection error for ${connectionPrefix}:`, err);
        });
        connection.on('close', () => {
          console.error(`Connection closed for ${connectionPrefix}`);
        });
        return connection;
      } catch (e) {
        if (!AMQPConnection.retrySettings) {
          throw new Error(`Failed to open connection: ${e.message}`);
        }
        try {
          AMQPConnection.retrySettings.continueOrPropagate(e, retryIndex);
        } catch (ex) {
          throw new Error(`Retries completed. Failed to open connection: ${e.message}`);
        }
        retryIndex++;
      }
    }
  }
  async getOrCreateChannel(connectionType, queueOrExchangeName) {
    if (connectionType === ConnectionType.SUBSCRIBER) {
      const subChnName = `${connectionType};${queueOrExchangeName}`;
      const locChn = this.subscriberReservedChannelPool.get(subChnName);
      // In amqplib, channels emit 'close' or 'error' but there's no synchronous isOpen().
      // We'll assume if it's in the pool, it's usable, until we add close handlers.
      if (locChn) {
        return locChn;
      }
      if (!this.subscriberConnection) {
        this.subscriberConnection = await this.createConnection(ConnectionType.SUBSCRIBER);
      }
      const subChn = await this.borrowChannel(connectionType, this.subscriberConnection);
      this.subscriberReservedChannelPool.set(subChnName, subChn);
      return subChn;
    } else {
      if (!this.publisherConnection) {
        this.publisherConnection = await this.createConnection(ConnectionType.PUBLISHER);
      }
      return await this.borrowChannel(connectionType, this.publisherConnection);
    }
  }
  async createChannel(connType, rmqConnection) {
    let retryIndex = 1;
    while (true) {
      try {
        const locChn = await rmqConnection.createChannel();
        locChn.on('close', () => {
          console.error(`${connType} Channel has been closed`);
        });
        locChn.on('error', (err) => {
          console.error(`${connType} Channel has error:`, err);
        });
        return locChn;
      } catch (e) {
        if (!AMQPConnection.retrySettings) {
          throw new Error(`Cannot open ${connType} channel: ${e.message}`);
        }
        try {
          AMQPConnection.retrySettings.continueOrPropagate(e, retryIndex);
        } catch (ex) {
          throw new Error(`Retries completed. Cannot open ${connType} channel: ${e.message}`);
        }
        retryIndex++;
      }
    }
  }
  async borrowChannel(connectionType, rmqConnection) {
    let channels = this.availableChannelPool.get(connectionType);
    if (!channels) {
      channels = new Set();
      this.availableChannelPool.set(connectionType, channels);
    }
    if (channels.size > 0) {
      const channel = channels.values().next().value;
      channels.delete(channel);
      return channel;
    }
    return await this.createChannel(connectionType, rmqConnection);
  }
  async returnChannel(connectionType, channel) {
    if (!channel) {
      return;
    }
    let channels = this.availableChannelPool.get(connectionType);
    if (!channels) {
      channels = new Set();
      this.availableChannelPool.set(connectionType, channels);
    }
    channels.add(channel);
  }
  async close() {
    console.log('Closing all connections and channels');
    this.availableChannelPool.clear();
    this.subscriberReservedChannelPool.clear();
    if (this.publisherConnection) {
      try {
        await this.publisherConnection.close();
      } catch (e) {
        console.warn('Failed to close publisher connection', e);
      }
    }
    if (this.subscriberConnection) {
      try {
        await this.subscriberConnection.close();
      } catch (e) {
        console.warn('Failed to close subscriber connection', e);
      }
    }
    this.publisherConnection = null;
    this.subscriberConnection = null;
  }
}
exports.AMQPConnection = AMQPConnection;
