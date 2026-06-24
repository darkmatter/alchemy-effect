import * as Schema from "effect/Schema";
import type {
  DefaultOptionalRequired,
  DefaultRequired,
  MetadataFor,
} from "./Internal.ts";
import { makeField } from "./Metadata.ts";
import type { EnvField, EnvFieldOptions } from "./Types.ts";

/**
 * Marks a schema field as a secret runtime value.
 *
 * Required secrets default to `requiredIn: "all"`. Passing
 * `{ optional: true }` makes the struct key exact-optional and removes it from
 * stage-required key sets unless `requiredIn` is provided explicitly.
 */
export function secret<
  const Field extends Schema.Top,
  const Options extends EnvFieldOptions = {},
>(
  schema: Field,
  options?: Options & { readonly optional?: false },
): EnvField<Field, MetadataFor<"secret", Options, DefaultRequired>>;
export function secret<
  const Field extends Schema.Top,
  const Options extends EnvFieldOptions = {},
>(
  schema: Field,
  options: Options & { readonly optional: true },
): EnvField<
  Schema.optionalKey<Field>,
  MetadataFor<"secret", Options, DefaultOptionalRequired>
>;
export function secret(
  schema: Schema.Top,
  options: EnvFieldOptions = {},
): EnvField {
  return makeField(schema, "secret", options);
}

/**
 * Marks a schema field as non-sensitive runtime configuration.
 *
 * Public fields are useful for values that may be bound to server runtimes and
 * optionally emitted into client-side environment manifests.
 */
export function publicEnv<
  const Field extends Schema.Top,
  const Options extends EnvFieldOptions = {},
>(
  schema: Field,
  options?: Options & { readonly optional?: false },
): EnvField<Field, MetadataFor<"public", Options, DefaultRequired>>;
export function publicEnv<
  const Field extends Schema.Top,
  const Options extends EnvFieldOptions = {},
>(
  schema: Field,
  options: Options & { readonly optional: true },
): EnvField<
  Schema.optionalKey<Field>,
  MetadataFor<"public", Options, DefaultOptionalRequired>
>;
export function publicEnv(
  schema: Schema.Top,
  options: EnvFieldOptions = {},
): EnvField {
  return makeField(schema, "public", options);
}

/**
 * Marks a schema field as derived configuration.
 *
 * Use this for values computed from other config values or deployed resource
 * outputs, while still keeping them visible in the central env contract.
 */
export function derived<
  const Field extends Schema.Top,
  const Options extends EnvFieldOptions = {},
>(
  schema: Field,
  options?: Options & { readonly optional?: false },
): EnvField<Field, MetadataFor<"derived", Options, DefaultRequired>>;
export function derived<
  const Field extends Schema.Top,
  const Options extends EnvFieldOptions = {},
>(
  schema: Field,
  options: Options & { readonly optional: true },
): EnvField<
  Schema.optionalKey<Field>,
  MetadataFor<"derived", Options, DefaultOptionalRequired>
>;
export function derived(
  schema: Schema.Top,
  options: EnvFieldOptions = {},
): EnvField {
  return makeField(schema, "derived", options);
}
