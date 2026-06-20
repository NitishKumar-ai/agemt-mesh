// HyperDAO interface for Hyper integration
export interface HyperDAO {
  /** Save a source document */
  saveSourceDocument(doc: SourceDocument): Promise<void>;
  /** Save a fact */
  saveFact(fact: Fact): Promise<void>;
  /** Create a conflict record */
  createConflict(conflict: Conflict): Promise<void>;
  /** Resolve a conflict */
  resolveConflict(conflictId: string, status: string): Promise<void>;
  /** Save permission entries */
  savePermissions(permissions: UserPermission[]): Promise<void>;
  /** Retrieve permissions for a user */
  getUserPermissions(userId: string): Promise<UserPermission[]>;
}

// Minimal type definitions (real ones are elsewhere)
export interface SourceDocument {
  id: string;
  content: string;
  metadata?: Record<string, unknown>;
}
export interface Fact {
  id: string;
  documentId: string;
  text: string;
  metadata?: Record<string, unknown>;
}
export interface Conflict {
  id: string;
  factId: string;
  description: string;
  status: string;
}
export interface UserPermission {
  userId: string;
  permission: string;
}
