import * as ConfigProvider from "effect/ConfigProvider";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import type * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Command from "effect/unstable/cli/Command";

import { apply } from "../../src/Apply.ts";
import { provideFreshArtifactStore } from "../../src/Artifacts.ts";
import * as CLI from "../../src/Cli/index.ts";
import { dotAlchemy } from "../../src/Config.ts";
import * as Plan from "../../src/Plan.ts";
import * as Stack from "../../src/Stack.ts";
import { Stage } from "../../src/Stage.ts";
import * as State from "../../src/State/index.ts";
import { loadConfigProvider } from "../../src/Util/ConfigProvider.ts";
import { fileLogger } from "../../src/Util/FileLogger.ts";
import { dryRun, envFile, force, main, stage, yes } from "./shared.ts";

const execStack = Effect.fn(function* ({
  main,
  stage,
  envFile,
  dryRun = false,
  force = false,
  yes = false,
  destroy = false,
}: {
  main: string;
  stage: string;
  envFile: Option.Option<string>;
  dryRun?: boolean;
  force?: boolean;
  yes?: boolean;
  destroy?: boolean;
}) {
  const path = yield* Path.Path;
  const module = yield* Effect.promise(
    () => import(path.resolve(process.cwd(), main)),
  );
  const stackEffect = module.default as ReturnType<
    ReturnType<typeof Stack.make>
  >;
  if (!stackEffect) {
    return yield* Effect.die(
      new Error(
        `Main file '${main}' must export a default stack definition (export default defineStack({...}))`,
      ),
    );
  }

  const configProvider = yield* loadConfigProvider(envFile);

  // TODO(sam): implement local and watch

  const rootLogger = Logger.layer([fileLogger("out")]);

  const alchemy = Layer.mergeAll(
    // TODO(sam): support overriding these
    State.LocalState,
    CLI.inkCLI(),
    Layer.provideMerge(rootLogger, dotAlchemy),
  );

  yield* Effect.gen(function* () {
    const cli = yield* CLI.Cli;
    const stack = yield* stackEffect;

    yield* Effect.gen(function* () {
      const updatePlan = yield* Plan.make(
        destroy
          ? {
              ...stack,
              // TODO(sam): probably better to have Plan.destroy and Plan.update
              resources: {},
              bindings: {},
              output: {},
            }
          : stack,
        { force },
      );
      if (dryRun) {
        yield* cli.displayPlan(updatePlan);
      } else {
        if (!yes) {
          const approved = yield* cli.approvePlan(updatePlan);
          if (!approved) {
            return;
          }
        }
        const outputs = yield* apply(updatePlan);

        yield* Console.log(outputs);
      }
    }).pipe(Effect.provide(stack.services), provideFreshArtifactStore);
  }).pipe(
    Effect.provide(Layer.provideMerge(alchemy, Layer.succeed(Stage, stage))),
    Effect.provideService(ConfigProvider.ConfigProvider, configProvider),
  ) as Effect.Effect<void, any, never>;
  // TODO(sam): figure out why we need to cast to remove the Provider<never> requirement
});

export const deployCommand = Command.make(
  "deploy",
  {
    dryRun,
    force,
    main,
    envFile,
    stage,
    yes,
  },
  execStack,
);

export const destroyCommand = Command.make(
  "destroy",
  {
    dryRun,
    main,
    envFile,
    stage,
    yes,
  },
  (args) =>
    execStack({
      ...args,
      destroy: true,
    }),
);

export const planCommand = Command.make(
  "plan",
  {
    main,
    envFile,
    stage,
  },
  (args) =>
    execStack({
      ...args,
      dryRun: true,
    }),
);
