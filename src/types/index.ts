export interface SearchResult {
  jobNumbers: string[];
  totalCount: number | undefined;
}

export interface DeleteStats {
  totalDeleted: number;
  errorCount: number;
  iterationCount: number;
}

export interface SearchDocument {
  JobNumber?: string;
  ExpirationDate?: string;
  [key: string]: unknown;
}
