import { SearchClient, AzureKeyCredential } from '@azure/search-documents';
import type { SearchResult, SearchDocument } from './types/index.js';

const endpoint = process.env.AZURE_SEARCH_ENDPOINT;
const apiKey = process.env.AZURE_SEARCH_API_KEY;
const indexName = process.env.INDEX_NAME;
const yearsBack = Number(process.env.YEARS_BACK);
const fetchSize = Number(process.env.FETCH_SIZE);
const rateLimitDelayInMs = Number(process.env.RATE_LIMIT_DELAY_MS);

const client = new SearchClient<SearchDocument>(endpoint, indexName, new AzureKeyCredential(apiKey));

async function sleep(ms: number): Promise<void> {
  await Bun.sleep(ms);
}

async function fetchJobNumbers(filter: string, limit: number): Promise<SearchResult> {
  const jobNumbers: string[] = [];

  try {
    const results = await client.search('*', {
      filter,
      select: ['JobNumber'],
      top: limit,
      includeTotalCount: true,
    });

    const totalCount = results.count;

    for await (const result of results.results) {
      const jobNumber = result.document?.JobNumber;
      if (jobNumber) jobNumbers.push(jobNumber);
    }

    return { jobNumbers, totalCount };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error:', message);
    throw error;
  }
}

async function processInChunks(filter: string): Promise<void> {
  let totalFetched = 0;
  let iterationCount = 0;
  let totalMatchingDocs: number | null = null;

  console.log('Iniciando búsqueda de documentos...');
  console.log(`Estrategia: Buscar ${fetchSize} docs → Imprimir → Repetir\n`);

  while (true) {
    iterationCount++;

    try {
      const { jobNumbers, totalCount } = await fetchJobNumbers(filter, fetchSize);

      if (totalMatchingDocs === null && totalCount !== undefined) {
        totalMatchingDocs = totalCount;
        console.log(`📊 Total de documentos que coinciden: ${totalMatchingDocs.toLocaleString()}\n`);
      }

      if (jobNumbers.length === 0) {
        console.log('\n✓ No hay más documentos para mostrar');
        break;
      }

      console.log(`\n[Iteración ${iterationCount}] Encontrados ${jobNumbers.length} documentos`);
      console.log(jobNumbers.join(', '));

      totalFetched += jobNumbers.length;

      if (jobNumbers.length < fetchSize) {
        console.log('\n✓ Último lote procesado');
        break;
      }

      await sleep(rateLimitDelayInMs);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`\n✗ Error en iteración ${iterationCount}:`, message);
      await sleep(5000);
    }
  }

  console.log(`\nTotal de JobNumbers mostrados: ${totalFetched.toLocaleString()}`);
  if (totalMatchingDocs !== null) {
    console.log(`Total de documentos en el índice: ${totalMatchingDocs.toLocaleString()}`);
  }
}

async function main(): Promise<void> {
  const expirationLimitDate = new Date();
  expirationLimitDate.setFullYear(expirationLimitDate.getFullYear() - yearsBack);
  const isoDate = expirationLimitDate.toISOString();

  const filter = `ExpirationDate lt ${isoDate}`;
  console.log(`\n🔍 Buscando JobNumbers en ${indexName} con ExpirationDate < ${isoDate}...\n`);

  await processInChunks(filter);
}

main().catch(error => {
  console.error('\n❌ Error fatal:', error);
  process.exit(1);
});
