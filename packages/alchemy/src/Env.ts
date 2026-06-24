/**
 * Helpers for defining a single typed environment contract with Effect Schema.
 *
 * The intended shape is a normal `Schema.Struct` whose fields are annotated with
 * deployment metadata:
 *
 * ```ts
 * const EnvSchema = Schema.Struct({
 *   API_TOKEN: Env.secret(Schema.String),
 *   PUBLIC_URL: Env.publicEnv(Schema.String),
 *   DB: Env.binding<Cloudflare.D1Database>(),
 * });
 * ```
 *
 * Applications can then derive smaller surfaces from that one contract:
 * secret-file schemas, Worker binding keys, required keys for a stage, and
 * typed service-specific slices.
 */

export * from "./Env/Binding.ts";
export * from "./Env/Fields.ts";
export * from "./Env/Keys.ts";
export * from "./Env/Metadata.ts";
export * from "./Env/Selectors.ts";
export * from "./Env/Static.ts";
export * from "./Env/Types.ts";
