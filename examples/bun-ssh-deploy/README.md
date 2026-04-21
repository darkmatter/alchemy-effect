# bun-ssh-deploy example

Smoke test for `alchemy/Bun.SshDeploy` — rsyncs a tiny Bun HTTP app to a
remote host, uploads an `EnvironmentFile=` payload, and restarts the
matching systemd unit.

## Host setup

The target host needs `bun` on `$PATH` and a systemd unit like:

```ini
[Unit]
Description=bun ssh deploy example
After=network-online.target

[Service]
WorkingDirectory=/opt/bun-ssh-deploy-example
EnvironmentFile=/opt/bun-ssh-deploy-example/.env
ExecStart=/usr/bin/env bun run app/server.ts
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Enable it once (`systemctl enable bun-ssh-deploy-example`) and make sure
the deploy key's public half is in `~root/.ssh/authorized_keys` on the
target.

## Run

```bash
export SSH_HOST=203.0.113.10
export SSH_PRIVATE_KEY="$(cat ~/.ssh/deploy_key)"
export HEALTH_URL=http://203.0.113.10:8080/health

bun run alchemy deploy
```

Successive runs only re-deploy when inputs change (`rsyncExcludes`,
`buildSteps`, `envFile.content`, etc.) — the `diff` short-circuits via
a deploy hash.
