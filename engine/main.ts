import CollectionManager from '@/controllers/collection-manager.ts';
import ProtocolV2 from '@/controllers/protocol-v2.ts';

function startMemoryMonitor(intervalMs = 5000) {
  const collectionManager = CollectionManager.getInstance();
  setInterval(() => {
    const entriesCount = collectionManager.mapManager.size() ?? 0;
    const mapsCount = collectionManager.mapManager.mapsCount() ?? 0;
    const usage = Deno.memoryUsage();
    console.clear();
    console.log(
      `[MEMORY] rss=${(usage.rss / 1024 / 1024).toFixed(2)}MB | heapUsed=${(
        usage.heapUsed /
        1024 /
        1024
      ).toFixed(2)}MB | heapTotal=${(usage.heapTotal / 1024 / 1024).toFixed(
        2
      )}MB | external=${(usage.external / 1024 / 1024).toFixed(
        2
      )}MB | entriesCount=${entriesCount} | mapsCount=${mapsCount}`
    );
  }, intervalMs);
}

if (import.meta.main) {
  const collectionManager = CollectionManager.getInstance();

  const protocol = ProtocolV2.start(collectionManager);

  // startMemoryMonitor(1000); // log every 1s
}
