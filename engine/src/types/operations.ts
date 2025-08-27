export type Operation = "GET" | "SET" | "DELETE" | "UPDATE";

export enum Status {
  OK,
  ERROR,
}

export type Response<T = undefined> = {
  status: Status;
  data?: T | null;
};
