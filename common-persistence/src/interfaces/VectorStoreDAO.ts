// VectorStoreDAO interface for Hyper integration
export interface VectorStoreDAO {
  /** Insert a vector for a given ID */
  insertVector(id: string, embedding: number[]): Promise<void>;
  /** Search similar vectors */
  searchSimilarity(embedding: number[], limit: number): Promise<Array<{ id: string; score: number }>>;
}
