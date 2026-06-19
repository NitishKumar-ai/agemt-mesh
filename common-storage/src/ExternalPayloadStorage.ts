/**
 * External payload storage for transparently offloading large JSON payloads
 * (workflow/task input/output) from the message queue to durable storage.
 *
 * Storage path convention:
 *   workflow/input/<uuid>.json
 *   workflow/output/<uuid>.json
 *   task/input/<uuid>.json
 *   task/output/<uuid>.json
 */
export interface ExternalPayloadStorage {
  /**
   * Store a JSON-stringified payload at the given path.
   * Returns a fully qualified storage URI (e.g. gs://bucket/path).
   */
  store(path: string, payload: string): Promise<string>;

  /**
   * Retrieve the payload stored at the given path.
   * Returns null if no payload exists at that path.
   */
  get(path: string): Promise<string | null>;

  /**
   * Remove the payload at the given path.
   * Returns true if the payload was deleted, false if not found.
   */
  remove(path: string): Promise<boolean>;

  /**
   * Generate a time-limited signed URL for direct download access.
   * @param path - storage path
   * @param expirationInSeconds - signed URL validity duration in seconds
   */
  getSignedUrl(path: string, expirationInSeconds: number): Promise<string>;
}
