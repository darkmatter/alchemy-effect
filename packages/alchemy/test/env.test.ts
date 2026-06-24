import * as Schema from "effect/Schema";
import { describe, expect, expectTypeOf, test } from "vitest";

import * as Env from "@/Env";

describe("Env", () => {
  const Contract = Schema.Struct({
    API_TOKEN: Env.secret(Schema.String),
    APP_URL: Env.publicEnv(Schema.String, {
      requiredIn: ["development", "production"] as const,
      source: "sops",
    }),
    AUTH_DB: Env.binding<{ readonly fetch: () => Promise<Response> }>(),
    OPTIONAL_TOKEN: Env.secret(Schema.String, { optional: true }),
    RELEASE: Env.staticValue(Schema.Literal("stable"), "stable"),
  });

  test("env fields are regular Effect Schema fields", () => {
    const decoded = Schema.decodeUnknownSync(Contract)({
      API_TOKEN: "secret",
      APP_URL: "https://example.com",
      AUTH_DB: { fetch: async () => new Response() },
      RELEASE: "stable",
    });

    expect(decoded.APP_URL).toBe("https://example.com");
    expect(decoded.OPTIONAL_TOKEN).toBeUndefined();
  });

  test("metadata is attached to cloned fields", () => {
    const metadata = Env.metadataFor(Contract.fields.APP_URL);

    expect(metadata).toMatchObject({
      kind: "public",
      requiredIn: ["development", "production"],
      bindToWorker: true,
      optional: false,
      source: "sops",
    });
    expect(Env.metadataFor(Schema.String)).toBeUndefined();
  });

  test("filters keys and schemas by field kind", () => {
    expect(Env.keysForKind(Contract, ["secret", "public"])).toStrictEqual([
      "API_TOKEN",
      "APP_URL",
      "OPTIONAL_TOKEN",
    ]);
    expect(Env.boundKeys(Contract)).toStrictEqual([
      "API_TOKEN",
      "APP_URL",
      "AUTH_DB",
      "OPTIONAL_TOKEN",
      "RELEASE",
    ]);
    expect(Env.boundKeysForKind(Contract, ["secret", "public"])).toStrictEqual([
      "API_TOKEN",
      "APP_URL",
      "OPTIONAL_TOKEN",
    ]);

    const SopsSchema = Env.schemaForKinds(Contract, ["secret", "public"]);
    const decoded = Schema.decodeUnknownSync(SopsSchema)({
      API_TOKEN: "secret",
      APP_URL: "https://example.com",
    });

    expect(decoded).toStrictEqual({
      API_TOKEN: "secret",
      APP_URL: "https://example.com",
    });
  });

  test("picks typed slices from a contract value", () => {
    const env: Schema.Schema.Type<typeof Contract> = {
      API_TOKEN: "secret",
      APP_URL: "https://example.com",
      AUTH_DB: { fetch: async () => new Response() },
      RELEASE: "stable",
    };

    const authEnv = Env.pickEnv(Contract, env, [
      "API_TOKEN",
      "AUTH_DB",
    ] as const);

    expect(authEnv.API_TOKEN).toBe("secret");
    expectTypeOf(authEnv).toEqualTypeOf<{
      readonly API_TOKEN: string;
      readonly AUTH_DB: { readonly fetch: () => Promise<Response> };
    }>();
  });

  test("exposes static key coverage helpers", () => {
    type SopsKeys = Env.KeysForKind<typeof Contract, "secret" | "public">;
    type RequiredProductionKeys = Env.RequiredKeysForStage<
      typeof Contract,
      "production"
    >;
    type BoundSopsKeys = Env.BoundKeysForKind<
      typeof Contract,
      "secret" | "public"
    >;
    type DevelopmentJson = {
      readonly API_TOKEN: string;
      readonly APP_URL: string;
      readonly sops: unknown;
    };

    expectTypeOf<SopsKeys>().toEqualTypeOf<
      "API_TOKEN" | "APP_URL" | "OPTIONAL_TOKEN"
    >();
    expectTypeOf<RequiredProductionKeys>().toEqualTypeOf<
      "API_TOKEN" | "APP_URL" | "AUTH_DB" | "RELEASE"
    >();
    expectTypeOf<BoundSopsKeys>().toEqualTypeOf<
      "API_TOKEN" | "APP_URL" | "OPTIONAL_TOKEN"
    >();
    expectTypeOf<
      Env.AssertNever<
        Env.MissingKeys<
          Exclude<SopsKeys, "OPTIONAL_TOKEN">,
          Env.JsonKeys<DevelopmentJson>
        >
      >
    >().toEqualTypeOf<never>();
  });
});
