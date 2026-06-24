import * as Schema from "effect/Schema";
import type { DefaultRequired, MetadataFor } from "./Internal.ts";
import { makeField } from "./Metadata.ts";
import type { EnvField, StaticEnvFieldOptions } from "./Types.ts";

/**
 * Marks a literal deployment-time value in the contract.
 *
 * `value` is stored in metadata for generators, while `schema` remains the
 * runtime validator.
 */
export function staticValue<
  const Field extends Schema.Top,
  const Value,
  const Options extends StaticEnvFieldOptions = {},
>(
  schema: Field,
  value: Value,
  options?: Options,
): EnvField<Field, MetadataFor<"static", Options, DefaultRequired, Value>> {
  return makeField(schema, "static", { ...options, value }) as EnvField<
    Field,
    MetadataFor<"static", Options, DefaultRequired, Value>
  >;
}
