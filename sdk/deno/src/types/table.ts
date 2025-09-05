export type Table = {
  [name: string]: {
    type: "string" | "number" | "boolean";
    modifiers?: ("unique" | "required" | "indexed")[];
  };
};
