import { InMemoryCollectionsCatalog } from "@/services/collections-catalog.ts";
import MapManager from "@/controllers/map-manager.ts";
import { autobindStatics } from "@/utils/autobind-statics.ts";

export default class CollectionManager {
  private static instance: CollectionManager;

  public static readonly catalog: InMemoryCollectionsCatalog =
    new InMemoryCollectionsCatalog();
  public static readonly mapManager: MapManager<any> = new MapManager(
    this.catalog
  );

  public static setup(): CollectionManager {
    if (!this.instance) {
      this.instance = new CollectionManager();
    }

    return this.instance;
  }

  public static getCatalog = () => this.catalog;
  public static getMapManager = () => this.mapManager;
}

const boundMethods: Pick<
  typeof CollectionManager,
  "setup" | "getCatalog" | "getMapManager"
> = autobindStatics(CollectionManager);

export const setup = boundMethods.setup;
export const getCatalog = boundMethods.getCatalog;
export const getMapManager = boundMethods.getMapManager;
