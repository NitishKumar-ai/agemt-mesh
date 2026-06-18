export interface Message {
  id: string;
  payload: string;
  receipt?: string;
  priority?: number;
}
