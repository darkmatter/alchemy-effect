/**
 * Effect-native helpers for `sops` (Mozilla SOPS) encrypted secret files.
 *
 * Targets the common Alchemy use-case where infrastructure declarations
 * need a few values (API tokens, deploy keys, dotenv blobs) decrypted at
 * deploy time without baking them into the project. Designed to compose
 * with `Redacted` so secrets never leak through state, logs, or argv.
 *
 * Two-tier resolution order:
 *
 *   1. environment variable (CI provides them directly, no decryption)
 *   2. SOPS file extract (local dev, also CI when an age key is mounted)
 *
 * Failures from `sops` are swallowed to `null` so a single missing entry
 * doesn't break a layer that wires up many of them — the caller validates
 * the specifically-required fields.
 *
 * Pre-requisites:
 *   - The `sops` binary is installed and on PATH.
 *   - The age private key is reachable via `SOPS_AGE_KEY` env var or
 *     `~/.config/sops/age/keys.txt` (resolved by `resolveAgeKey`).
 */

import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Redacted from "effect/Redacted";

export class SopsError extends Data.TaggedError("Sops/SopsError")<{
  message: string;
  cause?: unknown;
}> {}

/**
 * Resolve the SOPS age private key. Returns null when no key is available
 * (caller decides whether that's fatal).
 *
 * Order: `SOPS_AGE_KEY` env var → `~/.config/sops/age/keys.txt`.
 */
export const resolveAgeKey = Effect.gen(function* () {
  const fromEnv = process.env.SOPS_AGE_KEY ?? "";
  if (fromEnv) return fromEnv;

  const fs = yield* FileSystem.FileSystem;
  const keyFile = join(homedir(), ".config/sops/age/keys.txt");

  const exists = yield* fs.exists(keyFile);
  if (!exists) return null;

  const content = yield* fs.readFileString(keyFile, "utf-8");
  const match = content.match(/^AGE-SECRET-KEY-[A-Z0-9]+/m);
  return match ? match[0] : null;
}).pipe(Effect.orElseSucceed(() => null));

/**
 * Decrypt a single key from a sops-encrypted YAML file.
 *
 * Returns `null` on any failure (key missing, wrong identity, file not
 * found, sops binary not installed, etc.) so that a multi-secret loader
 * can degrade gracefully when one entry is unavailable.
 *
 * Implemented with `Bun.spawn` for one-shot stdout capture. If you're
 * running on Node, swap this for `child_process.execFile` — the rest of
 * the module is runtime-agnostic.
 */
export const sopsDecrypt = (
  file: string,
  key: string,
): Effect.Effect<string | null> =>
  Effect.tryPromise({
    try: async () => {
      const proc = (globalThis as any).Bun.spawn(
        ["sops", "-d", "--extract", `["${key}"]`, file],
        { stdout: "pipe", stderr: "pipe" },
      );
      const exitCode = await proc.exited;
      if (exitCode !== 0) return null;
      const out = await new Response(proc.stdout).text();
      const trimmed = out.trim();
      return trimmed.length > 0 ? trimmed : null;
    },
    catch: () => null,
  }).pipe(Effect.orElseSucceed(() => null));

/**
 * Decrypt a whole sops-encrypted file and return its plaintext contents.
 *
 * `sops` infers the format from the file extension — for a `.env` file
 * you'll get back raw `KEY=VALUE\n` lines (suitable for systemd's
 * `EnvironmentFile=`), for YAML/JSON you get the full document.
 *
 * Returns `null` on any failure so callers can fall back to an env var
 * or other source.
 */
export const sopsDecryptFile = (
  file: string,
): Effect.Effect<string | null> =>
  Effect.tryPromise({
    try: async () => {
      const proc = (globalThis as any).Bun.spawn(["sops", "-d", file], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const exitCode = await proc.exited;
      if (exitCode !== 0) return null;
      const out = await new Response(proc.stdout).text();
      return out.length > 0 ? out : null;
    },
    catch: () => null,
  }).pipe(Effect.orElseSucceed(() => null));

/**
 * Read `envVar` from the process environment first, otherwise decrypt the
 * named entry from the given sops file. Returns the empty string when
 * both sources fail — see module-level note.
 */
export const envOrSops = (
  envVar: string,
  file: string,
  key: string,
): Effect.Effect<string> =>
  Effect.gen(function* () {
    const fromEnv = process.env[envVar];
    if (fromEnv) return fromEnv;
    const fromSops = yield* sopsDecrypt(file, key);
    return fromSops ?? "";
  });

/**
 * Same as {@link envOrSops} but wraps the result in `Redacted` so the
 * value never gets logged. Use for anything that shouldn't appear in
 * Effect's debug output (private keys, dotenv blobs, API tokens).
 */
export const envOrSopsRedacted = (
  envVar: string,
  file: string,
  key: string,
): Effect.Effect<Redacted.Redacted<string>> =>
  envOrSops(envVar, file, key).pipe(Effect.map(Redacted.make));

/**
 * Derive a deterministic password from the SOPS age key. Useful for the
 * `ALCHEMY_PASSWORD` state-store password: stable across runs, derivable
 * from a key the operator already has, no extra secret to store.
 */
export const deriveAlchemyPassword = (ageKey: string): string =>
  createHash("sha256").update(ageKey).digest("hex");

/**
 * Ensure `ALCHEMY_PASSWORD` is set in `process.env`. If absent, derives
 * it from the resolved age key. Fails with {@link SopsError} when no
 * key is available.
 *
 * Run this once at the top of an Alchemy entrypoint Effect:
 *
 * ```typescript
 * yield* Sops.ensureAlchemyPassword;
 * ```
 */
export const ensureAlchemyPassword: Effect.Effect<
  void,
  SopsError,
  FileSystem.FileSystem
> = Effect.gen(function* () {
  if (process.env.ALCHEMY_PASSWORD) return;

  const ageKey = yield* resolveAgeKey;
  if (!ageKey) {
    return yield* Effect.fail(
      new SopsError({
        message:
          "ALCHEMY_PASSWORD is not set and SOPS_AGE_KEY is unavailable.\n" +
          "  Set it manually:  export ALCHEMY_PASSWORD='<some-secret>'\n" +
          "  Or provide an age key:  export SOPS_AGE_KEY='AGE-SECRET-KEY-1...'",
      }),
    );
  }

  process.env.ALCHEMY_PASSWORD = deriveAlchemyPassword(ageKey);
});

/**
 * Parse a `postgres://user:pass@host/db` URL into discrete fields.
 * Convenience helper for sops entries that store full Postgres URLs.
 */
export interface PgCredentials {
  host: string;
  database: string;
  user: string;
  password: string;
}

export const parsePgUrl = (url: string): PgCredentials => {
  const u = new URL(url);
  return {
    host: u.hostname,
    database: u.pathname.replace(/^\//, ""),
    user: u.username,
    password: decodeURIComponent(u.password),
  };
};
