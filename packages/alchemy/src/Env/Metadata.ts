import * as Schema from "effect/Schema";
import {
  EnvFieldMetadataSymbol,
  type EnvField,
  type EnvFieldKind,
  type EnvFieldMetadata,
  type EnvFieldOptions,
  type FieldMetadata,
} from "./Types.ts";

/**
 * Reads env metadata from a schema field.
 *
 * Returns `undefined` for regular Effect schemas that were not created with an
 * `Env` helper.
 */
export function metadataFor<const Field extends EnvField>(
  field: Field,
): FieldMetadata<Field>;
export function metadataFor(field: Schema.Top): EnvFieldMetadata | undefined;
export function metadataFor(field: Schema.Top): EnvFieldMetadata | undefined {
  return (field as { readonly [EnvFieldMetadataSymbol]?: EnvFieldMetadata })[
    EnvFieldMetadataSymbol
  ];
}

/** Returns true when a schema field carries Alchemy env metadata. */
export const isEnvField = (field: Schema.Top): field is EnvField =>
  metadataFor(field) !== undefined;

/**
 * Creates an annotated env field.
 *
 * This is exported for sibling modules, not as a primary user-facing API.
 */
export const makeField = (
  schema: Schema.Top,
  kind: EnvFieldKind,
  options: EnvFieldOptions & { readonly value?: unknown },
): EnvField => {
  const optional = options.optional ?? false;
  // Clone before attaching metadata so shared Effect schema singletons are not
  // mutated globally.
  const annotated = (optional ? Schema.optionalKey(schema) : schema).annotate(
    {},
  ) as EnvField;
  const metadata: EnvFieldMetadata = {
    kind,
    requiredIn: options.requiredIn ?? (optional ? [] : "all"),
    bindToWorker: options.bindToWorker ?? true,
    optional,
    optionalAtRuntime: options.optionalAtRuntime ?? false,
    source: options.source,
    exposes: options.exposes,
    value: options.value,
  };
  Object.defineProperty(annotated, EnvFieldMetadataSymbol, {
    value: metadata,
    enumerable: false,
  });
  return annotated;
};
