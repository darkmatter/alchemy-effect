import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Redacted from "effect/Redacted";
import * as Schedule from "effect/Schedule";
import * as Stream from "effect/Stream";
import { ChildProcess } from "effect/unstable/process";
import { createHash } from "node:crypto";
import { isResolved } from "../Diff.ts";
import * as Provider from "../Provider.ts";
import { Resource } from "../Resource.ts";
import type { Providers } from "./Providers.ts";

const sha256Hex = (input: string): string =>
  createHash("sha256").update(input).digest("hex");

export interface SshDeployProps {
  /** Remote host (IP or DNS). */
  host: string;
  /** SSH port. */
  port: number;
  /** Remote SSH user. */
  user: string;
  /**
   * OpenSSH PEM-format private key (full multi-line string, including the
   * BEGIN/END markers). Wrap with `Redacted.make(...)` at the call site
   * so the key never lands in state or logs.
   */
  privateKey: Redacted.Redacted<string>;
  /** Local source directory to rsync. Trailing slash optional. */
  localPath: string;
  /** Remote destination directory. Created if missing. */
  remotePath: string;
  /**
   * Working directory recorded for diagnostics. Should match the systemd
   * unit's `WorkingDirectory=`. Build steps run from `remotePath`, NOT
   * here — this is informational only.
   */
  workingDirectory?: string;
  /**
   * Shell commands to run on the remote after rsync, before restart.
   * Joined with `&&` and executed under `bash -lc`, cwd = `remotePath`.
   */
  buildSteps?: ReadonlyArray<string>;
  /** systemd unit name to restart after build. */
  systemdUnit: string;
  /**
   * Additional systemd units to restart after `systemdUnit` (e.g. a Caddy
   * frontend that also reads `envFile.remotePath` and needs to re-exec).
   */
  additionalRestartUnits?: ReadonlyArray<string>;
  /** Patterns passed to `rsync --exclude`. */
  rsyncExcludes?: ReadonlyArray<string>;
  /**
   * Optional: write a runtime environment file onto the remote VM before
   * the unit restart. Lines are dotenv format (`KEY=VALUE\n`), suitable
   * for systemd `EnvironmentFile=`. Content is streamed via SSH stdin so
   * it never appears in argv or local disk.
   */
  envFile?: {
    content: Redacted.Redacted<string>;
    /** Absolute path on the remote. Created with mode 0600 via `umask 077`. */
    remotePath: string;
  };
  /**
   * Optional: shell command to run on the remote host after restart as a
   * readiness probe. Runs under `bash -lc`, must exit 0. Retried until
   * `healthTimeout` elapses (every 2s).
   */
  healthCheckCommand?: string;
  /**
   * Optional: HTTP URL to curl from the operator's machine after restart
   * (must return 2xx). Prefer `healthCheckCommand` when public-edge
   * reachability is intentionally decoupled from origin readiness.
   */
  healthCheckUrl?: string;
  /** Health-check budget in milliseconds. Defaults to 60000. */
  healthTimeoutMs?: number;
}

export interface SshDeploy extends Resource<
  "Bun.SshDeploy",
  SshDeployProps,
  {
    host: string;
    port: number;
    user: string;
    remotePath: string;
    workingDirectory?: string;
    systemdUnit: string;
    /** ISO timestamp of the most recent successful deploy. */
    lastDeployedAt: string;
    /** Hash of build inputs (buildSteps + rsyncExcludes + units + envFile content). */
    deployHash: string;
    /** Where the env file landed on the remote (path only — never the content). */
    envFileRemotePath?: string;
  },
  never,
  Providers
> {}

/**
 * Ships a Bun (or Node) application to a remote host over SSH and restarts
 * its systemd unit.
 *
 * Pairs with a host-side service manager that already owns the unit
 * (e.g. NixOS `services.bunApp`, a systemd unit file installed by
 * configuration management, etc.). This resource is responsible only for:
 *
 * 1. rsync'ing the application source to `remotePath`
 * 2. running `buildSteps` on the remote (cwd = `remotePath`)
 * 3. (optional) writing `envFile.content` to `envFile.remotePath` (mode 0600)
 * 4. `systemctl restart` of `systemdUnit` (+ `additionalRestartUnits`)
 * 5. (optional) waiting for `healthCheckCommand` or `healthCheckUrl` to pass
 *
 * Lifecycle:
 *   create  → full deploy
 *   update  → full deploy (rsync is idempotent; restart only if hash changed)
 *   delete  → `systemctl stop` of `systemdUnit` (does NOT remove `remotePath`)
 *
 * The private key is written to a 0600 temp file for the duration of the
 * deploy and unlinked afterwards. Host key checking is disabled (the host
 * IP is presumed to come from a trusted source like an infra registry).
 *
 * @section Deploying a Bun app to a NixOS microVM
 * @example Switchblade-style deploy
 * ```typescript
 * import * as Bun from "alchemy/Bun";
 * import * as Redacted from "effect/Redacted";
 *
 * const deploy = yield* Bun.SshDeploy("server", {
 *   host: "15.204.104.4",
 *   port: 2201,
 *   user: "root",
 *   privateKey: Redacted.make(deployKey),
 *   localPath: import.meta.dirname + "/../..",
 *   remotePath: "/opt/switchblade",
 *   systemdUnit: "bun-app-switchblade",
 *   buildSteps: [
 *     "bun install --frozen-lockfile",
 *     "cd apps/server && bun run build",
 *   ],
 *   rsyncExcludes: [".git", "node_modules", ".env*"],
 *   additionalRestartUnits: ["caddy"],
 *   envFile: {
 *     content: Redacted.make(runtimeDotenv),
 *     remotePath: "/opt/switchblade/.env",
 *   },
 *   healthCheckCommand:
 *     "curl -fsS -k --resolve api.iridium.sh:443:127.0.0.1 https://api.iridium.sh/health >/dev/null",
 * });
 * ```
 */
export const SshDeploy = Resource<SshDeploy>("Bun.SshDeploy");

export const SshDeployProvider = () =>
  Provider.effect(
    SshDeploy,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      const hashInputs = (props: SshDeployProps) =>
        sha256Hex(
          JSON.stringify({
            host: props.host,
            port: props.port,
            user: props.user,
            remotePath: props.remotePath,
            workingDirectory: props.workingDirectory ?? null,
            buildSteps: props.buildSteps ?? [],
            rsyncExcludes: props.rsyncExcludes ?? [],
            systemdUnit: props.systemdUnit,
            additionalRestartUnits: props.additionalRestartUnits ?? [],
            envFilePath: props.envFile?.remotePath ?? null,
            envFileContent: props.envFile
              ? sha256Hex(Redacted.value(props.envFile.content))
              : null,
          }),
        );

      /**
       * Provide a 0600 temp key file path for the duration of `f`. The
       * file is removed (along with its parent dir) on scope exit, even
       * on failure.
       */
      const withKeyFile = <A, E, R>(
        privateKey: Redacted.Redacted<string>,
        f: (keyPath: string) => Effect.Effect<A, E, R>,
      ) =>
        Effect.scoped(
          Effect.gen(function* () {
            const dir = yield* fs.makeTempDirectoryScoped({
              prefix: "alchemy-ssh-",
            });
            const keyPath = path.join(dir, "id");
            yield* fs.writeFileString(keyPath, Redacted.value(privateKey));
            yield* fs.chmod(keyPath, 0o600);
            return yield* f(keyPath);
          }),
        );

      const sshArgs = (
        keyPath: string,
        port: number,
      ): ReadonlyArray<string> => [
        "-o",
        "StrictHostKeyChecking=no",
        "-o",
        "UserKnownHostsFile=/dev/null",
        "-i",
        keyPath,
        "-p",
        String(port),
      ];

      const exec = Effect.fnUntraced(function* (
        cmd: string,
        args: ReadonlyArray<string>,
        opts: { stdin?: string } = {},
      ) {
        const handle = yield* ChildProcess.make(cmd, args as string[], {
          stdin: opts.stdin !== undefined ? "pipe" : "inherit",
        });
        if (opts.stdin !== undefined && handle.stdin) {
          yield* Stream.run(
            Stream.fromIterable([new TextEncoder().encode(opts.stdin)]),
            handle.stdin,
          );
        }
        const [exitCode, stderr] = yield* Effect.all([
          handle.exitCode,
          Stream.mkString(Stream.decodeText(handle.stderr)),
        ] as const);
        if (exitCode !== 0) {
          return yield* Effect.die(
            `${cmd} exited with code ${exitCode}${stderr ? `\n${stderr}` : ""}`,
          );
        }
      });

      const ssh = (
        keyPath: string,
        props: SshDeployProps,
        remoteCmd: string,
        opts: { stdin?: string } = {},
      ) =>
        exec(
          "ssh",
          [
            ...sshArgs(keyPath, props.port),
            `${props.user}@${props.host}`,
            remoteCmd,
          ],
          opts,
        );

      const rsync = (keyPath: string, props: SshDeployProps) => {
        const sshCmd = ["ssh", ...sshArgs(keyPath, props.port)].join(" ");
        const excludeArgs = (props.rsyncExcludes ?? []).flatMap((p) => [
          "--exclude",
          p,
        ]);
        const localPath = props.localPath.endsWith("/")
          ? props.localPath
          : `${props.localPath}/`;
        const remoteSpec = `${props.user}@${props.host}:${props.remotePath}/`;
        return exec("rsync", [
          "-az",
          "--delete",
          ...excludeArgs,
          "-e",
          sshCmd,
          localPath,
          remoteSpec,
        ]);
      };

      const waitForHealthyRemote = (
        keyPath: string,
        props: SshDeployProps,
        command: string,
      ) =>
        ssh(keyPath, props, `bash -lc ${shellQuote(command)}`).pipe(
          Effect.retry({
            schedule: Schedule.spaced("2 seconds"),
            times: Math.max(1, Math.floor((props.healthTimeoutMs ?? 60_000) / 2_000)),
          }),
        );

      const waitForHealthyUrl = (url: string, timeoutMs: number) =>
        Effect.tryPromise({
          try: async () => {
            const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
          },
          catch: (e) => e,
        }).pipe(
          Effect.retry({
            schedule: Schedule.spaced("2 seconds"),
            times: Math.max(1, Math.floor(timeoutMs / 2_000)),
          }),
          Effect.orDie,
        );

      const deploy = (
        id: string,
        props: SshDeployProps,
        session: { note: (msg: string) => Effect.Effect<void> },
      ) =>
        withKeyFile(props.privateKey, (keyPath) =>
          Effect.gen(function* () {
            yield* session.note(`mkdir -p ${props.remotePath}`);
            yield* ssh(
              keyPath,
              props,
              `mkdir -p ${shellQuote(props.remotePath)}`,
            );

            yield* session.note(`rsync → ${props.host}:${props.remotePath}/`);
            yield* rsync(keyPath, props);

            if (props.buildSteps && props.buildSteps.length > 0) {
              const remoteScript = [
                `cd ${shellQuote(props.remotePath)}`,
                ...props.buildSteps,
              ].join(" && ");
              yield* session.note(`remote build (${props.buildSteps.length} steps)`);
              yield* ssh(keyPath, props, `bash -lc ${shellQuote(remoteScript)}`);
            }

            if (props.envFile) {
              const envRemote = props.envFile.remotePath;
              const envScript =
                `umask 077 && ` +
                `mkdir -p ${shellQuote(path.dirname(envRemote))} && ` +
                `cat > ${shellQuote(envRemote)} && ` +
                `chmod 600 ${shellQuote(envRemote)}`;
              yield* session.note(`upload env → ${envRemote}`);
              yield* ssh(keyPath, props, `bash -lc ${shellQuote(envScript)}`, {
                stdin: Redacted.value(props.envFile.content),
              });
            }

            yield* session.note(`restart ${props.systemdUnit}`);
            yield* ssh(
              keyPath,
              props,
              `systemctl restart ${shellQuote(props.systemdUnit)} && ` +
                `sleep 3 && ` +
                `systemctl is-active --quiet ${shellQuote(props.systemdUnit)} || ` +
                `(systemctl status --no-pager -n 30 ${shellQuote(props.systemdUnit)}; exit 1)`,
            );

            if (
              props.additionalRestartUnits &&
              props.additionalRestartUnits.length > 0
            ) {
              const units = props.additionalRestartUnits.map(shellQuote).join(" ");
              yield* session.note(
                `restart additional: ${props.additionalRestartUnits.join(", ")}`,
              );
              yield* ssh(
                keyPath,
                props,
                `bash -lc ${shellQuote(
                  `for u in ${units}; do ` +
                    `  systemctl restart "$u" && ` +
                    `    (sleep 2; systemctl is-active --quiet "$u" || ` +
                    `      (systemctl status --no-pager -n 30 "$u"; exit 1)); ` +
                    `done`,
                )}`,
              );
            }

            if (props.healthCheckCommand) {
              yield* session.note(`remote health check`);
              yield* waitForHealthyRemote(
                keyPath,
                props,
                props.healthCheckCommand,
              );
            } else if (props.healthCheckUrl) {
              yield* session.note(`http health check ${props.healthCheckUrl}`);
              yield* waitForHealthyUrl(
                props.healthCheckUrl,
                props.healthTimeoutMs ?? 60_000,
              );
            }
          }),
        );

      const buildOutput = (props: SshDeployProps): SshDeploy["Attributes"] => ({
        host: props.host,
        port: props.port,
        user: props.user,
        remotePath: props.remotePath,
        workingDirectory: props.workingDirectory,
        systemdUnit: props.systemdUnit,
        lastDeployedAt: new Date().toISOString(),
        deployHash: hashInputs(props),
        envFileRemotePath: props.envFile?.remotePath,
      });

      return SshDeploy.Provider.of({
        // Host/port/user/remotePath/systemdUnit are stable across updates —
        // changing them implies a different deploy target / unit, not an
        // in-place update of the existing one.
        stables: ["host", "port", "user", "remotePath", "systemdUnit"],
        diff: Effect.fnUntraced(function* ({ news, output }) {
          if (!isResolved(news)) return undefined;
          if (!output) return undefined;
          if (
            output.host !== news.host ||
            output.port !== news.port ||
            output.user !== news.user ||
            output.remotePath !== news.remotePath ||
            output.systemdUnit !== news.systemdUnit
          ) {
            return { action: "replace" } as const;
          }
          if (output.deployHash !== hashInputs(news)) {
            return { action: "update" } as const;
          }
          // Always re-deploy when nothing material changed: rsync is
          // cheap and the local source tree may have changed without any
          // prop change. Callers that want strict memoization should set
          // `deployHash`-bearing props (e.g. include a content-hash in
          // `buildSteps`) or wrap this in a `Build.Command`.
          return { action: "update" } as const;
        }),
        create: Effect.fnUntraced(function* ({ id, news, session }) {
          yield* deploy(id, news, session);
          return buildOutput(news);
        }),
        update: Effect.fnUntraced(function* ({ id, news, session }) {
          yield* deploy(id, news, session);
          return buildOutput(news);
        }),
        delete: Effect.fnUntraced(function* ({ olds, session }) {
          yield* session.note(`stop ${olds.systemdUnit}`);
          yield* withKeyFile(olds.privateKey, (keyPath) =>
            ssh(
              keyPath,
              olds,
              `systemctl stop ${shellQuote(olds.systemdUnit)} || true`,
            ),
          ).pipe(
            Effect.catchCause((cause) =>
              Effect.logWarning("SshDeploy stop-on-delete failed", cause),
            ),
          );
        }),
      });
    }),
  );

const shellQuote = (s: string): string =>
  `'${s.replace(/'/g, "'\\''")}'`;
