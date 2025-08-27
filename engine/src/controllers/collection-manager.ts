import { InMemoryCollectionsCatalog } from "@/services/collections-catalog.ts";
import { InMemoryDataStore } from "@/services/data-store.ts";
import Archive from "../services/archive.ts";

class CollectionManager {
  private static instance: CollectionManager;

  public readonly catalog = new InMemoryCollectionsCatalog();
  public readonly dataStore = new InMemoryDataStore(
    this.catalog,
    Archive.getInstance()
  );

  private constructor() {}

  public static getInstance() {
    if (!this.instance) {
      this.instance = new CollectionManager();
    }

    return this.instance;
  }
}

export default CollectionManager;
