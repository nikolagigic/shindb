import { InMemoryCollectionsCatalog } from '@/services/collections-catalog.ts';
import MapManager from '@/controllers/map-manager.ts';
import { Client } from '@/sdk/controllers/client.ts';
import { type MemoryConfig } from '@/services/memory-manager.ts';

export default class CollectionManager {
  private static instance: CollectionManager;

  private readonly catalog: InMemoryCollectionsCatalog =
    new InMemoryCollectionsCatalog();
  private readonly mapManager: MapManager<any>;
  public readonly sdk: Client;

  constructor(memoryConfig?: MemoryConfig) {
    this.mapManager = new MapManager(this.catalog, memoryConfig);
    this.sdk = new Client(this.catalog, this.mapManager);
  }

  public static setup(memoryConfig?: MemoryConfig): CollectionManager {
    if (!this.instance) {
      this.instance = new CollectionManager(memoryConfig);
    }

    return this.instance;
  }

  // Memory management methods
  startMemoryMonitoring(): void {
    this.mapManager.startMemoryMonitoring();
  }

  stopMemoryMonitoring(): void {
    this.mapManager.stopMemoryMonitoring();
  }

  getMemoryStats() {
    return this.mapManager.getMemoryStats();
  }

  updateMemoryConfig(config: Partial<MemoryConfig>): void {
    this.mapManager.updateMemoryConfig(config);
  }

  getLRUStats() {
    return this.mapManager.getLRUStats();
  }

  resetEmergencyBrake(): void {
    this.mapManager.resetEmergencyBrake();
  }

  getEmergencyBrakeStatus() {
    return this.mapManager.getEmergencyBrakeStatus();
  }

  // Access to memory manager for testing
  get memoryManager() {
    return this.mapManager.memoryManager;
  }

  restartMemoryMonitoring(): void {
    this.mapManager.restartMemoryMonitoring();
  }
}
