// examples/bun-ssh-deploy — rsync + systemd deploy of a Bun service.
//
// Smoke test for `alchemy/Bun.SshDeploy`. Deploys a tiny Bun HTTP server
// from `./app` to a remote NixOS-style host that runs the bundle under
// a systemd unit whose `ExecStart` is `bun run app/server.ts` and which
// reads its secrets from `EnvironmentFile=`.
//
// Prerequisites on the target host:
//
//   * `bun` on $PATH for the unit's User.
//   * A systemd unit (example below) installed and enabled. The unit
//     file must read its config from the `EnvironmentFile=` that this
//     deploy uploads, so systemd picks up changes on `systemctl
//     restart`.
//
//     [Unit]
//     Description=bun ssh deploy example
//     After=network-online.target
//
//     [Service]
//     WorkingDirectory=/opt/bun-ssh-deploy-example
//     EnvironmentFile=/opt/bun-ssh-deploy-example/.env
//     ExecStart=/usr/bin/env bun run app/server.ts
//     Restart=on-failure
//
//     [Install]
//     WantedBy=multi-user.target
//
// Required environment:
//
//   SSH_HOST            public IP / hostname of the target
//   SSH_PORT            (default 22)
//   SSH_USER            (default root)
//   SSH_PRIVATE_KEY     full PEM body of the deploy key (not a path)
//   REMOTE_APP_DIR      (default /opt/bun-ssh-deploy-example)
//   SYSTEMD_UNIT        (default bun-ssh-deploy-example)
//   HEALTH_URL          (optional) URL hit on the host post-restart
import * as Alchemy from "alchemy";
import * as Bun from "alchemy/Bun";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import { resolve } from "node:path";

const env = (key: string, fallback?: string): string => {
  const v = process.env[key];
  if (v && v.length > 0) return v;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required env var: ${key}`);
};

export default Alchemy.Stack(
  "bun-ssh-deploy-example",
  { providers: Bun.providers() },
  Effect.gen(function* () {
    const server = yield* Bun.SshDeploy("server", {
      host: env("SSH_HOST"),
      port: Number(env("SSH_PORT", "22")),
      user: env("SSH_USER", "root"),
      privateKey: Redacted.make(env("SSH_PRIVATE_KEY")),
      localPath: resolve(import.meta.dirname, "app"),
      remotePath: env("REMOTE_APP_DIR", "/opt/bun-ssh-deploy-example"),
      buildSteps: ["bun install --frozen-lockfile"],
      systemdUnit: env("SYSTEMD_UNIT", "bun-ssh-deploy-example"),
      rsyncExcludes: [".git", "node_modules"],
      envFile: {
        content: Redacted.make(`PORT=8080\nGREETING=hello from ssh-deploy\n`),
        remotePath: `${env("REMOTE_APP_DIR", "/opt/bun-ssh-deploy-example")}/.env`,
      },
      healthCheckUrl: process.env.HEALTH_URL,
    });

    return { server };
  }),
);
