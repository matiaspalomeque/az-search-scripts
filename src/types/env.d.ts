declare global {
  namespace NodeJS {
    interface ProcessEnv {
      AZURE_SEARCH_ENDPOINT: string;
      AZURE_SEARCH_API_KEY: string;
      INDEX_NAME: string;
      DOCUMENT_KEY_FIELD: string;
      YEARS_BACK: string;
      BATCH_SIZE: string;
      FETCH_SIZE: string;
      RETRY_ATTEMPTS: string;
      RETRY_DELAY_MS: string;
      RATE_LIMIT_DELAY_MS: string;
    }
  }
}

export {};
