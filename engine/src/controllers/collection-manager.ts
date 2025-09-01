import { InMemoryCollectionsCatalog } from "@/services/collections-catalog.ts";
import { InMemoryDataStore } from "@/services/data-store.ts";
import Archive from "@/services/archive.ts";
import MapManager from "@/controllers/map-manager.ts";

export default class CollectionManager {
  private static instance: CollectionManager;

  public readonly catalog = new InMemoryCollectionsCatalog();
  // public readonly dataStore = new InMemoryDataStore(
  //   this.catalog,
  //   Archive.getInstance()
  // );
  public readonly mapManager = new MapManager(this.catalog);

  private constructor() {}

  public static getInstance() {
    if (!this.instance) {
      this.instance = new CollectionManager();
    }

    return this.instance;
  }
}
