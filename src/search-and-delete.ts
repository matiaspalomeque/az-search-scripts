import {
  SearchClient,
  AzureKeyCredential,
  IndexDocumentsBatch,
  IndexDocumentsResult,
} from '@azure/search-documents';
import type { DeleteStats, SearchDocument } from './types/index.js';

const endpoint = process.env.AZURE_SEARCH_ENDPOINT;
const apiKey = process.env.AZURE_SEARCH_API_KEY;
const indexName = process.env.INDEX_NAME;
const yearsBack = Number(process.env.YEARS_BACK);
const documentKeyField = process.env.DOCUMENT_KEY_FIELD;
const batchSize = Number(process.env.BATCH_SIZE);
const fetchSize = Number(process.env.FETCH_SIZE);
const retryAttempts = Number(process.env.RETRY_ATTEMPTS);
const retryDelayInMs = Number(process.env.RETRY_DELAY_MS);
const rateLimitDelayInMs = Number(process.env.RATE_LIMIT_DELAY_MS);

const client = new SearchClient<SearchDocument>(endpoint, indexName, new AzureKeyCredential(apiKey));

async function sleep(ms: number): Promise<void> {
  await Bun.sleep(ms);
}

async function deleteBatchWithRetry(ids: string[], attempt: number = 1): Promise<IndexDocumentsResult> {
  try {
    const batch = new IndexDocumentsBatch<SearchDocument>();
    batch.delete(documentKeyField, ids);
    const result = await client.indexDocuments(batch);

    const failed = result.results?.filter(r => !r.succeeded) || [];
    if (failed.length > 0) {
      console.warn(`  ⚠️  ${failed.length} documentos fallaron en este lote`);
    }

    return result;
  } catch (error) {
    if (attempt < retryAttempts) {
      const delay = retryDelayInMs * attempt;
      console.warn(`  Error en lote (intento ${attempt}/${retryAttempts}), reintentando en ${delay}ms...`);
      await sleep(delay);
      return deleteBatchWithRetry(ids, attempt + 1);
    }
    throw error;
  }
}

async function fetchDocumentIds(filter: string, limit: number): Promise<string[]> {
  const ids: string[] = [];

  try {
    const results = await client.search('*', {
      filter,
      select: [documentKeyField],
      top: limit
    });

    for await (const result of results.results) {
      const id = result.document?.[documentKeyField];
      if (id) {
        ids.push(String(id));
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error obteniendo ${documentKeyField} de documentos:`, message);
    throw error;
  }

  return ids;
}

async function deleteBatchOfIds(ids: string[]): Promise<void> {
  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += batchSize) {
    batches.push(ids.slice(i, i + batchSize));
  }

  for (const batch of batches) {
    try {
      await deleteBatchWithRetry(batch);
      await sleep(rateLimitDelayInMs);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`✗ Error eliminando lote:`, message);
      throw error;
    }
  }
}

async function processInChunks(filter: string, estimatedTotal: number): Promise<DeleteStats> {
  let totalDeleted = 0;
  let errorCount = 0;
  let iterationCount = 0;
  const startTime = Date.now();

  console.log('Iniciando eliminación en chunks...');
  console.log(`Estrategia: Buscar ${fetchSize} docs → Eliminar → Repetir\n`);

  while (true) {
    iterationCount++;

    try {
      const ids = await fetchDocumentIds(filter, fetchSize);

      if (ids.length === 0) {
        console.log('\n✓ No hay más documentos para eliminar');
        break;
      }

      console.log(`\n[Iteración ${iterationCount}] Encontrados ${ids.length} documentos para eliminar`);

      await deleteBatchOfIds(ids);
      totalDeleted += ids.length;

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const rate = (totalDeleted / Number(elapsed)).toFixed(0);
      const remaining = estimatedTotal - totalDeleted;
      const eta = remaining > 0 ? ((remaining / Number(rate)) / 60).toFixed(1) : '0';

      console.log(`✓ Progreso: ${totalDeleted.toLocaleString()} / ${estimatedTotal.toLocaleString()} eliminados (${rate} docs/s)`);
      if (remaining > 0) {
        console.log(`  ⏱️  ETA: ~${eta} minutos restantes`);
      }

      if (ids.length < fetchSize) {
        console.log('✓ Último lote procesado');
        break;
      }

      await sleep(500);

    } catch (error) {
      errorCount++;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`\n✗ Error en iteración ${iterationCount}:`, message);

      if (errorCount > 5) {
        throw new Error('Demasiados errores consecutivos, abortando operación');
      }

      console.log('Esperando 5 segundos antes de reintentar...');
      await sleep(5000);
    }
  }

  return { totalDeleted, errorCount, iterationCount };
}

async function main(): Promise<void> {
  const expirationLimitDate = new Date();
  expirationLimitDate.setFullYear(expirationLimitDate.getFullYear() - yearsBack);
  const isoDate = expirationLimitDate.toISOString();

  const filter = `ExpirationDate lt ${isoDate}`;
  console.log(`\n🔍 Buscando documentos en ${indexName} con ExpirationDate < ${isoDate}...\n`);

  let estimatedTotal = 0;
  try {
    const countResults = await client.search('*', {
      filter,
      includeTotalCount: true,
      top: 0
    });
    estimatedTotal = countResults.count || 0;
    console.log(`📊 Estimados ~${estimatedTotal.toLocaleString()} documentos para eliminar de ${indexName}\n`);

    if (estimatedTotal === 0) {
      console.log('✓ No hay documentos para eliminar');
      return;
    }
  } catch (error) {
    console.warn('⚠️  No se pudo obtener el conteo exacto, continuando de todos modos...\n');
    estimatedTotal = 1000000;
  }

  const startTime = Date.now();
  const { totalDeleted, errorCount, iterationCount } = await processInChunks(filter, estimatedTotal);
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n' + '='.repeat(70));
  console.log('📋 RESUMEN DE OPERACIÓN');
  console.log('='.repeat(70));
  console.log(`✓ Total eliminados:       ${totalDeleted.toLocaleString()} documentos de ${indexName}`);
  console.log(`🔄 Iteraciones:           ${iterationCount}`);
  console.log(`⏱️  Tiempo total:          ${(Number(duration) / 60).toFixed(1)} minutos (${duration}s)`);
  console.log(`⚡ Velocidad promedio:    ${(totalDeleted / Number(duration)).toFixed(0)} docs/segundo`);
  if (errorCount > 0) {
    console.log(`⚠️  Iteraciones con error: ${errorCount}`);
  }
  console.log('='.repeat(70) + '\n');
}

main().catch(error => {
  console.error('\n❌ Error fatal:', error);
  process.exit(1);
});
