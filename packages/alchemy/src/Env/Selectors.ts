import * as Schema from "effect/Schema";
import type {
  BoundKeysForKind,
  EnvSlice,
  KeysBoundToWorker,
  KeysForKind,
} from "./Keys.ts";
import { metadataFor } from "./Metadata.ts";
import type { EnvFieldKind, EnvFieldsOf, EnvStruct } from "./Types.ts";

/** Returns keys whose fields match any of the provided kinds. */
export const keysForKind = <
  const Struct extends EnvStruct,
  const Kinds extends readonly EnvFieldKind[],
>(
  struct: Struct,
  kinds: Kinds,
): KeysForKind<Struct, Kinds[number]>[] => {
  const selected = new Set<EnvFieldKind>(kinds);
  return Object.entries(struct.fields)
    .filter(([, field]) => {
      const metadata = metadataFor(field);
      return metadata !== undefined && selected.has(metadata.kind);
    })
    .map(([key]) => key as KeysForKind<Struct, Kinds[number]>);
};

/** Returns all keys marked with `bindToWorker: true`. */
export const boundKeys = <const Struct extends EnvStruct>(
  struct: Struct,
): KeysBoundToWorker<Struct>[] =>
  Object.entries(struct.fields)
    .filter(([, field]) => metadataFor(field)?.bindToWorker === true)
    .map(([key]) => key as KeysBoundToWorker<Struct>);

/** Returns keys that match a kind and are marked with `bindToWorker: true`. */
export const boundKeysForKind = <
  const Struct extends EnvStruct,
  const Kinds extends readonly EnvFieldKind[],
>(
  struct: Struct,
  kinds: Kinds,
): BoundKeysForKind<Struct, Kinds[number]>[] => {
  const selected = new Set<EnvFieldKind>(kinds);
  return Object.entries(struct.fields)
    .filter(([, field]) => {
      const metadata = metadataFor(field);
      return (
        metadata !== undefined &&
        metadata.bindToWorker &&
        selected.has(metadata.kind)
      );
    })
    .map(([key]) => key as BoundKeysForKind<Struct, Kinds[number]>);
};

/**
 * Builds a `Schema.Struct` containing only fields of the provided kinds.
 *
 * This is the runtime counterpart to `KeysForKind`; for example, apps can
 * derive a schema for secret/public values stored in SOPS without maintaining a
 * second hand-written schema.
 */
export const schemaForKinds = <
  const Struct extends EnvStruct,
  const Kinds extends readonly EnvFieldKind[],
>(
  struct: Struct,
  kinds: Kinds,
): Schema.Struct<PickFields<Struct, KeysForKind<Struct, Kinds[number]>>> => {
  const selected = new Set<EnvFieldKind>(kinds);
  const fields = Object.fromEntries(
    Object.entries(struct.fields).filter(([, field]) => {
      const metadata = metadataFor(field);
      return metadata !== undefined && selected.has(metadata.kind);
    }),
  ) as PickFields<Struct, KeysForKind<Struct, Kinds[number]>>;
  return Schema.Struct(fields);
};

/**
 * Picks a typed slice from a decoded env value.
 *
 * Pass the contract as the first argument so TypeScript can preserve the exact
 * field types for the selected keys.
 */
export const pickEnv = <
  const Struct extends EnvStruct,
  const Keys extends readonly (keyof Schema.Schema.Type<Struct>)[],
>(
  _struct: Struct,
  env: Schema.Schema.Type<Struct>,
  keys: Keys,
): EnvSlice<Struct, Keys> => {
  const picked: Partial<Record<keyof Schema.Schema.Type<Struct>, unknown>> = {};
  for (const key of keys) {
    if (key in env) {
      picked[key] = env[key];
    }
  }
  return picked as EnvSlice<Struct, Keys>;
};

type PickFields<
  Struct extends EnvStruct,
  Keys extends keyof EnvFieldsOf<Struct>,
> = Pick<EnvFieldsOf<Struct>, Keys>;
