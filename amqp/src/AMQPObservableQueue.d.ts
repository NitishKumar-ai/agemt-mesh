import { Observable } from "rxjs";
import { Message } from "./core/Message";
import { ObservableQueue } from "./core/ObservableQueue";
import { AMQPSettings } from "./config/AMQPSettings";
import { AMQPRetryPattern } from "./AMQPConnection";
export declare class AMQPObservableQueue implements ObservableQueue {
  private readonly settings;
  private readonly retrySettings;
  private readonly batchSize;
  private readonly useExchange;
  private readonly pollTimeInMS;
  private readonly amqpConnection;
  private messages;
  private running;
  constructor(
    connectionUrl: string,
    useExchange: boolean,
    settings: AMQPSettings,
    retrySettings: AMQPRetryPattern | null,
    batchSize: number,
    pollTimeInMS: number,
  );
  observe(): Observable<Message>;
  getType(): string;
  getName(): string;
  getURI(): string;
  ack(messages: Message[]): Promise<string[]>;
  private ackMsg;
  publish(messages: Message[]): Promise<void>;
  private publishMessage;
  setUnackTimeout(message: Message, unackTimeout: number): void;
  size(): Promise<number>;
  close(): void;
  start(): void;
  stop(): void;
  isRunning(): boolean;
  private getOrCreateExchange;
  private getOrCreateQueue;
  private receiveMessagesWithSubscriber;
  private receiveMessages;
}
//# sourceMappingURL=AMQPObservableQueue.d.ts.map
