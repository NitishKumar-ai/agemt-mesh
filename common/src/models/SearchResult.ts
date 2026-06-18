export class SearchResult<T> {
  totalHits: number;
  results: T[];

  constructor(totalHits = 0, results: T[] = []) {
    this.totalHits = totalHits;
    this.results = results;
  }
}
