import { Types } from "mongoose";
import { badRequest } from "./errors";

export function assertObjectId(id: string, label = "id"): Types.ObjectId {
  if (!Types.ObjectId.isValid(id) || String(new Types.ObjectId(id)) !== id) {
    throw badRequest(`Invalid ${label}`);
  }
  return new Types.ObjectId(id);
}

export function escapeRegex(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Converts lean Mongoose docs into plain JSON-safe objects (ObjectId/Date -> string). */
export function serialize<T>(value: T): Jsonify<T> {
  return JSON.parse(JSON.stringify(value));
}

export type Jsonify<T> = T extends Date
  ? string
  : T extends Types.ObjectId
    ? string
    : T extends Array<infer U>
      ? Jsonify<U>[]
      : T extends object
        ? { [K in keyof T]: Jsonify<T[K]> }
        : T;
