export type Collections = Map<string, Table>;

export type Table = {
  [name: string]: {
    type: "string" | "number" | "boolean";
    modifiers?: ("unique" | "required" | "indexed")[];
  };
};

// Helper type to check if a field is required
export type IsRequired<T> = T extends { modifiers: readonly string[] }
  ? "required" extends T["modifiers"][number] ? true
  : false
  : false;

// Helper type to get the base type
type GetType<T> = T extends { type: "string" } ? string
  : T extends { type: "number" } ? number
  : T extends { type: "boolean" } ? boolean
  : never;

// Required fields
type RequiredFields<T extends Table> = {
  [K in keyof T as IsRequired<T[K]> extends true ? K : never]: GetType<T[K]>;
};

// Optional fields
type OptionalFields<T extends Table> = {
  [K in keyof T as IsRequired<T[K]> extends false ? K : never]?: GetType<T[K]>;
};

// Utility type to transform Table schema into TypeScript types
export type TableToType<T extends Table> =
  & RequiredFields<T>
  & OptionalFields<T>;

export type TableToUpdateType<T extends Table> = {
  [K in keyof T]?: GetType<T[K]>;
};

export type TableToUpdateWithIdType<T extends Table> = {
  id: number;
  doc: {
    [K in keyof T]?: GetType<T[K]>;
  };
};

export type Data = Map<string, unknown>;

// Query types
export interface QueryOperators {
  eq?: unknown;
  gt?: unknown;
  lt?: unknown;
  gte?: unknown;
  lte?: unknown;
  in?: unknown[];
  nin?: unknown[];
  contains?: unknown;
  overlap?: unknown[];
}

export interface QueryOperatorsWithNot extends QueryOperators {
  not?: QueryOperators;
}

// Type-safe operators based on field type
type FieldOperators<T> = T extends { type: "string" } ? {
    eq?: string;
    gt?: string;
    lt?: string;
    gte?: string;
    lte?: string;
    in?: string[];
    nin?: string[];
    contains?: string;
    not?: {
      eq?: string;
      gt?: string;
      lt?: string;
      gte?: string;
      lte?: string;
      in?: string[];
      nin?: string[];
      contains?: string;
    };
  }
  : T extends { type: "number" } ? {
      eq?: number;
      gt?: number;
      lt?: number;
      gte?: number;
      lte?: number;
      in?: number[];
      nin?: number[];
      not?: {
        eq?: number;
        gt?: number;
        lt?: number;
        gte?: number;
        lte?: number;
        in?: number[];
        nin?: number[];
      };
    }
  : T extends { type: "boolean" } ? {
      eq?: boolean;
      not?: {
        eq?: boolean;
      };
    }
  : never;

export type Condition<T extends Table = Table> = {
  [K in keyof T]: {
    field: K;
    op: FieldOperators<T[K]>;
  };
}[keyof T];

export type WhereQuery<T extends Table = Table> =
  | { AND: (WhereQuery<T> | Condition<T>)[] }
  | { OR: (WhereQuery<T> | Condition<T>)[] }
  | Condition<T>;

// Type alias for the find method parameter
export type FindQuery<T extends Table = Table> = WhereQuery<T>;
