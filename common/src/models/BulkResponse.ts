export class BulkResponse<T> {
  bulkSuccessfulResults: T[] = [];
  bulkErrorResults: Record<string, string> = {};
  message = 'Bulk Request has been processed.';

  appendSuccessResponse(result: T): void {
    this.bulkSuccessfulResults.push(result);
  }

  appendFailedResponse(id: string, errorMessage: string): void {
    this.bulkErrorResults[id] = errorMessage;
  }
}
