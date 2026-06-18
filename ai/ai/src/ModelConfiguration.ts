import { AIModel } from './AIModel.js';

/**
 * Configuration for an AIModel. Implementations build the model via get() and
 * optionally receive a shared HTTP client via setHttpClient().
 */
export interface ModelConfiguration<T extends AIModel> {
  get(): T;
  setHttpClient?(httpClient: unknown): void;
}
