import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Command from "effect/unstable/cli/Command";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";

import packageJson from "../package.json" with { type: "json" };
import { dotAlchemy } from "../src/Config.ts";
import { bootstrapCommand } from "./commands/bootstrap.ts";
import {
  deployCommand,
  destroyCommand,
  planCommand,
} from "./commands/deploy.ts";
import { logsCommand } from "./commands/logs.ts";
import { tailCommand } from "./commands/tail.ts";

const root = Command.make("alchemy", {}).pipe(
  Command.withSubcommands([
    bootstrapCommand,
    deployCommand,
    destroyCommand,
    planCommand,
    tailCommand,
    logsCommand,
  ]),
);

const cli = Command.run(root, {
  version: packageJson.version,
});

const services = Layer.mergeAll(
  Layer.provideMerge(dotAlchemy, NodeServices.layer),
  Layer.succeed(ConfigProvider.ConfigProvider, ConfigProvider.fromEnv()),
  FetchHttpClient.layer,
);

cli.pipe(Effect.provide(services), Effect.scoped, NodeRuntime.runMain);
