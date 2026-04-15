import * as Effect from "effect/Effect";
import * as Command from "effect/unstable/cli/Command";
import * as ChildProcess from "effect/unstable/process/ChildProcess";

import { envFile, main, stage } from "./shared.ts";

export const devCommand = Command.make(
  "dev",
  {
    main,
    envFile,
    stage,
  },
  Effect.fnUntraced(function* ({ envFile, main, stage }) {
    const cmd = ChildProcess.make("bun", ["--hot", main], {
      env: {
        ALCHEMY_PHASE: "dev",
      },
    });

    const proc = yield* cmd;

    proc.stdout;
    proc.stderr;
    proc.all;
  }),
);
