import * as Auth from "@distilled.cloud/aws/Auth";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import * as Option from "effect/Option";
import * as Command from "effect/unstable/cli/Command";
import * as Flag from "effect/unstable/cli/Flag";

import * as AWSAccount from "../../src/AWS/Account.ts";
import {
  bootstrap as bootstrapAws,
  destroyBootstrap as destroyBootstrapAws,
} from "../../src/AWS/Bootstrap.ts";
import * as AWSCredentials from "../../src/AWS/Credentials.ts";
import * as AWSRegion from "../../src/AWS/Region.ts";
import { loadConfigProvider } from "../../src/Util/ConfigProvider.ts";
import { fileLogger } from "../../src/Util/FileLogger.ts";
import { envFile } from "./shared.ts";

const awsProfile = Flag.string("profile").pipe(
  Flag.withDescription("AWS profile to use for credentials"),
  Flag.optional,
  Flag.map(Option.getOrElse(() => "default")),
);

const awsRegion = Flag.string("region").pipe(
  Flag.withDescription(
    "AWS region to bootstrap (defaults to AWS_REGION env var)",
  ),
  Flag.optional,
  Flag.map(Option.getOrUndefined),
);

const bootstrapDestroy = Flag.boolean("destroy").pipe(
  Flag.withDescription("Destroy all bootstrap buckets in the selected region"),
  Flag.withDefault(false),
);

export const bootstrapCommand = Command.make(
  "bootstrap",
  {
    envFile,
    profile: awsProfile,
    region: awsRegion,
    destroy: bootstrapDestroy,
  },
  Effect.fnUntraced(function* ({ envFile, profile, region, destroy }) {
    const platform = Logger.layer([fileLogger("bootstrap.txt")]);

    return yield* Effect.gen(function* () {
      const ssoProfile = yield* Auth.loadProfile(profile);

      const credentials = yield* Auth.loadProfileCredentials(profile);

      const awsLayers = Layer.mergeAll(
        Layer.succeed(AWSAccount.Account, profile),
        Layer.succeed(
          AWSRegion.Region,
          region ?? ssoProfile.region ?? "us-east-1",
        ),
        Layer.succeed(AWSCredentials.Credentials, Effect.succeed(credentials)),
      );

      return yield* Effect.gen(function* () {
        const provider = yield* loadConfigProvider(envFile);
        const bootstrapLayer = Layer.provide(
          awsLayers,
          Layer.succeed(ConfigProvider.ConfigProvider, provider),
        );
        if (destroy) {
          yield* destroyBootstrapAws().pipe(
            Effect.tap((result) =>
              result.destroyed === 0
                ? Console.log("✓ No bootstrap buckets found to destroy")
                : Console.log(
                    `✓ Destroyed ${result.destroyed} bootstrap bucket(s): ${result.bucketNames.join(", ")}`,
                  ),
            ),
            Effect.provide(bootstrapLayer),
          );
          return;
        }
        yield* bootstrapAws().pipe(
          Effect.tap(({ bucketName, created }) =>
            created
              ? Console.log(`✓ Created assets bucket: ${bucketName}`)
              : Console.log(`✓ Assets bucket already exists: ${bucketName}`),
          ),
          Effect.provide(bootstrapLayer),
        );
      });
    }).pipe(Effect.provide(platform)) as Effect.Effect<void, any, never>;
  }),
);
