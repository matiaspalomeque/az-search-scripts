# Azure Search Scripts

TypeScript utilities for querying and deleting expired documents from Azure AI Search indexes based on date-based filters.

## Features

- **Search** - Read-only queries to find expired documents
- **Search and Delete** - Batch deletion with retry logic and progress tracking
- Built-in rate limiting and error handling
- Progress tracking with ETA calculations
- Spanish console output with emoji indicators

## Prerequisites

- [Bun](https://bun.sh/) 1.0 or higher
- Azure AI Search service with admin API key
- Access to an Azure Search index

## Installation

```bash
bun install
```

## Configuration

1. Copy the example environment file:
```bash
cp .env.example .env
```

2. Edit `.env` with your Azure Search credentials:
```bash
# Azure Search Configuration
AZURE_SEARCH_ENDPOINT=https://your-service.search.windows.net
AZURE_SEARCH_API_KEY=your-api-key
INDEX_NAME=your-index-name
DOCUMENT_KEY_FIELD=JobNumber  # or your document key field

# Operational Parameters
YEARS_BACK=2                    # Documents older than N years
BATCH_SIZE=1000                 # Delete batch size (max 1000)
FETCH_SIZE=10000                # Query fetch size per iteration
RETRY_ATTEMPTS=3                # Retry count for failed operations
RETRY_DELAY_MS=1000             # Base delay (exponential backoff)
RATE_LIMIT_DELAY_MS=100         # Delay between API calls
```

## Usage

### Search (Read-Only)

Query and display expired documents without modifying the index:

```bash
bun run search
```

This script:
- Fetches documents with `ExpirationDate < (today - YEARS_BACK)`
- Prints matching JobNumbers to console in batches
- Shows total count and pagination progress
- Safe to run without affecting data

### Search and Delete (Destructive)

Delete expired documents in batches:

```bash
bun run search-and-delete
```

This script:
- Counts total documents matching the expiration filter
- Deletes in batches with automatic retry logic
- Displays progress with ETA and deletion rate
- Aborts after 5 consecutive errors

**Warning:** This operation is destructive and cannot be undone. Test with appropriate `YEARS_BACK` settings first.

### Type Checking

Verify TypeScript types without running the scripts:

```bash
bun run type-check
```

## Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `AZURE_SEARCH_ENDPOINT` | Azure Search service URL | - | Yes |
| `AZURE_SEARCH_API_KEY` | Admin API key | - | Yes |
| `INDEX_NAME` | Target index name | - | Yes |
| `DOCUMENT_KEY_FIELD` | Document key field name | - | Yes (delete only) |
| `YEARS_BACK` | Delete docs older than N years | 2 | Yes |
| `BATCH_SIZE` | Documents per delete batch | 1000 | Yes |
| `FETCH_SIZE` | Documents per query fetch | 10000 | Yes |
| `RETRY_ATTEMPTS` | Max retry attempts | 3 | Yes |
| `RETRY_DELAY_MS` | Retry delay (exponential) | 1000 | Yes |
| `RATE_LIMIT_DELAY_MS` | Delay between API calls | 100 | Yes |

## Safety Features

- **Retry Logic** - Automatic retry with exponential backoff for failed operations
- **Rate Limiting** - Configurable delays between API calls to avoid throttling
- **Error Handling** - Aborts after 5 consecutive failures to prevent runaway deletions
- **Progress Tracking** - Real-time progress with deletion rate and ETA
- **Batch Processing** - Respects Azure Search batch size limits (max 1000 per batch)
