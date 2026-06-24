import type * as Schema from "effect/Schema";
import type {
  EnvFieldKind,
  EnvFieldsOf,
  EnvStruct,
  FieldMetadata,
} from "./Types.ts";

/**
 * Keys whose field metadata matches a kind.
 *
 * This is useful for deriving secret-file schemas or public client-env surfaces
 * from one contract.
 */
export type KeysForKind<Struct extends EnvStruct, Kind extends EnvFieldKind> = {
  [Key in keyof EnvFieldsOf<Struct>]: FieldMetadata<
    EnvFieldsOf<Struct>[Key]
  > extends {
    readonly kind: Kind;
  }
    ? Key
    : never;
}[keyof EnvFieldsOf<Struct>] &
  string;

/** Keys marked with `bindToWorker: true`. */
export type KeysBoundToWorker<Struct extends EnvStruct> = {
  [Key in keyof EnvFieldsOf<Struct>]: FieldMetadata<
    EnvFieldsOf<Struct>[Key]
  > extends {
    readonly bindToWorker: true;
  }
    ? Key
    : never;
}[keyof EnvFieldsOf<Struct>] &
  string;

/** Keys that match a kind and are also marked for runtime binding. */
export type BoundKeysForKind<
  Struct extends EnvStruct,
  Kind extends EnvFieldKind,
> = Extract<KeysForKind<Struct, Kind>, KeysBoundToWorker<Struct>>;

/**
 * Keys required for a particular stage.
 *
 * Use this with `MissingKeys` and a stage-specific secret/config source to make
 * missing values a static type error.
 */
export type RequiredKeysForStage<
  Struct extends EnvStruct,
  Stage extends string,
> = {
  [Key in keyof EnvFieldsOf<Struct>]: FieldMetadata<
    EnvFieldsOf<Struct>[Key]
  > extends {
    readonly requiredIn: infer Required extends "all" | readonly string[];
  }
    ? Required extends "all"
      ? Key
      : Stage extends Required[number]
        ? Key
        : never
    : never;
}[keyof EnvFieldsOf<Struct>] &
  string;

/** Typed subset of a decoded env value. */
export type EnvSlice<
  Struct extends EnvStruct,
  Keys extends readonly (keyof Schema.Schema.Type<Struct>)[],
> = Pick<Schema.Schema.Type<Struct>, Extract<Keys[number], string>>;

/**
 * Extracts data keys from a JSON-like object type while ignoring metadata.
 *
 * The default metadata key is `sops`, matching SOPS JSON files.
 */
export type JsonKeys<Json, MetadataKey extends PropertyKey = "sops"> = Exclude<
  keyof Json,
  MetadataKey
> &
  string;

/** Expected keys that are absent from an actual key set. */
export type MissingKeys<
  Expected extends PropertyKey,
  Actual extends PropertyKey,
> = Exclude<Expected, Actual>;

/** Actual keys that are not declared by the expected key set. */
export type UnexpectedKeys<
  Actual extends PropertyKey,
  Expected extends PropertyKey,
> = Exclude<Actual, Expected>;

/**
 * Compile-time assertion helper.
 *
 * Example:
 *
 * ```ts
 * type _Coverage = Env.AssertNever<
 *   Env.MissingKeys<RequiredKeys, Env.JsonKeys<typeof secrets>>
 * >;
 * ```
 */
export type AssertNever<T extends never> = T;
