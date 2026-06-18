import { Message } from "./Message";
import { Observable } from "rxjs";

export interface ObservableQueue {
  observe(): Observable<Message>;
  getType(): string;
  getName(): string;
  getURI(): string;
  ack(messages: Message[]): string[] | Promise<string[]>;
  publish(messages: Message[]): void | Promise<void>;
  setUnackTimeout(message: Message, unackTimeout: number): void;
  size(): number | Promise<number>;
  close(): void;
  start(): void;
  stop(): void;
  isRunning(): boolean;
}
