import { InMemoryCollectionsCatalog } from "@/services/collections-catalog.ts";
import MapManager from "@/controllers/map-manager.ts";
import { Client } from "@/sdk/controllers/client.ts";

export default class CollectionManager {
  private static instance: CollectionManager;

  private readonly catalog: InMemoryCollectionsCatalog =
    new InMemoryCollectionsCatalog();
  private readonly mapManager: MapManager<any> = new MapManager(this.catalog);
  public readonly sdk: Client = new Client(this.catalog, this.mapManager);

  public static setup(): CollectionManager {
    if (!this.instance) {
      this.instance = new CollectionManager();
    }

    return this.instance;
  }
}
