import { InMemoryCollectionsCatalog } from "@/services/collections-catalog.ts";
import MapManager from "@/controllers/map-manager.ts";

export default class CollectionManager {
  private static instance: CollectionManager;

  public readonly catalog = new InMemoryCollectionsCatalog();
  public readonly mapManager = new MapManager(this.catalog);

  private constructor() {
    this.catalog.set("users", {
      name: {
        type: "string",
        modifiers: ["required", "unique"],
      },
    });
  }

  public static getInstance() {
    if (!this.instance) {
      this.instance = new CollectionManager();
    }

    return this.instance;
  }
}
