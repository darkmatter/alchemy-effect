import type * as Schema from "effect/Schema";

/**
 * Non-enumerable marker used to attach Alchemy env metadata to Effect schemas.
 *
 * The symbol is exported for advanced tooling, but most callers should use
 * `metadataFor` instead of reading it directly.
 */
export const EnvFieldMetadataSymbol: unique symbol = Symbol.for(
  "alchemy/Env/FieldMetadata",
);

/**
 * Describes how an env field is produced and consumed.
 *
 * - `secret`: a sensitive runtime value, usually backed by SOPS, CI secrets, or
 *   a provider-native secret store.
 * - `public`: a non-sensitive runtime value that may be exposed to client code.
 * - `binding`: a provider runtime binding such as D1, KV, R2, Lambda, or a
 *   service binding.
 * - `derived`: a value computed from other fields or deployed resource outputs.
 * - `static`: a literal deployment-time value recorded in the contract.
 */
export type EnvFieldKind =
  | "binding"
  | "derived"
  | "public"
  | "secret"
  | "static";

/**
 * Stage coverage for a field.
 *
 * Use `"all"` for values that must exist in every stage. Use a literal stage
 * tuple, for example `["development", "production"] as const`, when a field is
 * required only in selected stages.
 */
export type RequiredIn<Stage extends string = string> =
  | "all"
  | readonly Stage[];

/**
 * Metadata attached to each annotated env field.
 *
 * The generic parameters intentionally preserve literal information from the
 * helper call. That lets types such as `RequiredKeysForStage` fail at compile
 * time when a secret key exists in one stage file but not another.
 */
export interface EnvFieldMetadata<
  Kind extends EnvFieldKind = EnvFieldKind,
  Required extends RequiredIn = RequiredIn,
  Value = unknown,
  BindToWorker extends boolean = boolean,
> {
  /** The producer/consumer category for this field. */
  readonly kind: Kind;
  /** Stages where this field is required. Defaults to `"all"` for required fields. */
  readonly requiredIn: Required;
  /** Whether this field should be attached to a runtime environment. */
  readonly bindToWorker: BindToWorker;
  /** Whether the field is optional in the Effect `Schema.Struct` type. */
  readonly optional: boolean;
  /** Whether runtime code may tolerate the value being absent after deployment. */
  readonly optionalAtRuntime: boolean;
  /** Optional free-form source label, such as `sops`, `github`, or `cloudflare`. */
  readonly source?: string;
  /** Optional public exposure label, such as a client-side env prefix. */
  readonly exposes?: string;
  /** Literal value for `static` fields. */
  readonly value?: Value;
}

/**
 * An Effect Schema field annotated with env metadata.
 *
 * `EnvField` is still a normal Effect Schema and can be passed directly to
 * `Schema.Struct`.
 */
export type EnvField<
  Field extends Schema.Top = Schema.Top,
  Metadata extends EnvFieldMetadata = EnvFieldMetadata,
> = Field & {
  readonly [EnvFieldMetadataSymbol]: Metadata;
};

/**
 * Options shared by `secret`, `publicEnv`, `binding`, and `derived`.
 */
export interface EnvFieldOptions<Stage extends string = string> {
  /** Stages where this value must be configured. Defaults to `"all"`. */
  readonly requiredIn?: RequiredIn<Stage>;
  /** Whether deployment code should include this value in runtime bindings. */
  readonly bindToWorker?: boolean;
  /** Makes the field an exact optional key in the surrounding `Schema.Struct`. */
  readonly optional?: boolean;
  /** Records that runtime code intentionally accepts a missing value. */
  readonly optionalAtRuntime?: boolean;
  /** Free-form source label for generators and audits. */
  readonly source?: string;
  /** Free-form exposure label for client-env or documentation generators. */
  readonly exposes?: string;
}

/**
 * Options for `staticValue`.
 *
 * Static fields are always concrete schema fields, so they do not support
 * `optional`.
 */
export interface StaticEnvFieldOptions<
  Stage extends string = string,
> extends Omit<EnvFieldOptions<Stage>, "optional"> {}

export type EnvStruct = Schema.Struct<Schema.Struct.Fields>;

/** Extracts the field map from a contract created with `Schema.Struct`. */
export type EnvFieldsOf<Struct extends EnvStruct> = Struct["fields"];

/**
 * Schema type used by `binding`.
 *
 * Provider bindings are not serializable config values, so they decode like
 * `Schema.Unknown` at runtime while preserving the caller-provided TypeScript
 * type inside `Schema.Struct`.
 */
export type BindingSchema<Value> = Schema.Unknown & {
  readonly Type: Value;
  readonly Iso: Value;
  readonly Rebuild: BindingSchema<Value>;
};

/** Extracts env metadata from an annotated field at the type level. */
export type FieldMetadata<Field> =
  Field extends EnvField<Schema.Top, infer Metadata> ? Metadata : never;
