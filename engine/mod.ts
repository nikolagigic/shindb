import {
  getCatalog,
  getMapManager,
  setup,
} from "@/controllers/collection-manager.ts";

const catalog: ReturnType<typeof getCatalog> = getCatalog();
const store: ReturnType<typeof getMapManager> = getMapManager();

export { setup, catalog, store };
