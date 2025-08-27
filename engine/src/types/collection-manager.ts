export type Collections = Map<string, Table>;

export type Table = {
  [name: string]: {
    type: "string" | "number" | "boolean";
    modifiers?: ("unique" | "required" | "indexed")[];
  };
};

export type Data = Map<string, unknown>;
