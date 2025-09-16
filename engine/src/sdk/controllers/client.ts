import MapManager from '../../controllers/map-manager.ts';
import { InMemoryCollectionsCatalog } from '../../services/collections-catalog.ts';

import { autobindStatics } from '../utils/autobind-statics.ts';

export class Client {
  private static connection: Deno.TcpConn | null = null;

  constructor(
    private readonly catalog: InMemoryCollectionsCatalog,
    private readonly mapManager: MapManager<any>
  ) {}

  private static async send<T extends Table, A extends keyof ActionResponse<T>>(
    collection: string,
    action: A,
    payload: ActionPayload<T, A>
  ) {}

  static collection<T extends Table>(name: string, _table: T) {
    if (!this.connection) throw new Error('Call setup() first');

    return {
      create: (doc: InferRow<T>) => this.send<T, 'create'>(name, 'create', doc),
      get: (query: { docId: DocId }) => this.send<T, 'get'>(name, 'get', query),
      update: (query: { docId: DocId }, update: Partial<InferRow<T>>) =>
        this.send<T, 'update'>(name, 'update', { query, update }),
      delete: (query: { docId: DocId }) =>
        this.send<T, 'delete'>(name, 'delete', query),

      createMany: (docs: InferRow<T>[]) =>
        this.send<T, 'createMany'>(name, 'createMany', docs),
      getMany: (ids: DocId[]) => this.send<T, 'getMany'>(name, 'getMany', ids),
      updateMany: (
        query: Partial<RowWithId<T>>,
        update: Partial<InferRow<T>>
      ) => this.send<T, 'updateMany'>(name, 'updateMany', { query, update }),
      deleteMany: (query: Partial<RowWithId<T>>) =>
        this.send<T, 'deleteMany'>(name, 'deleteMany', query),

      find: (where: WhereQuery<T>) => this.send<T, 'find'>(name, 'find', where),
    };
  }
}

export const { collection } = autobindStatics(Client);
