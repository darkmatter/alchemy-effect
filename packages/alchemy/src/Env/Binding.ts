import * as Schema from "effect/Schema";
import type {
  DefaultOptionalRequired,
  DefaultRequired,
  MetadataFor,
} from "./Internal.ts";
import { makeField } from "./Metadata.ts";
import type { BindingSchema, EnvField, EnvFieldOptions } from "./Types.ts";

/**
 * Marks a field as a provider runtime binding.
 *
 * Bindings preserve the caller-provided TypeScript type, but runtime decoding is
 * intentionally permissive because provider bindings are opaque objects rather
 * than serializable environment strings.
 */
export function binding<
  Value = unknown,
  const Options extends EnvFieldOptions = {},
>(
  options?: Options & { readonly optional?: false },
): EnvField<
  BindingSchema<Value>,
  MetadataFor<"binding", Options, DefaultRequired>
>;
export function binding<
  Value = unknown,
  const Options extends EnvFieldOptions = {},
>(
  options: Options & { readonly optional: true },
): EnvField<
  Schema.optionalKey<BindingSchema<Value>>,
  MetadataFor<"binding", Options, DefaultOptionalRequired>
>;
export function binding(options: EnvFieldOptions = {}): EnvField {
  return makeField(Schema.Unknown, "binding", options);
}
