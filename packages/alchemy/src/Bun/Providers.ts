import * as Layer from "effect/Layer";
import * as Provider from "../Provider.ts";
import { SshDeploy, SshDeployProvider } from "./SshDeploy.ts";

export class Providers extends Provider.ProviderCollection<Providers>()(
  "Bun",
) {}

/**
 * Provider layer for Bun-side resources (currently: `SshDeploy`).
 *
 * Merge into a stack's provider layer alongside whichever cloud
 * providers are in play:
 *
 * ```typescript
 * import * as Alchemy from "alchemy";
 * import * as Bun from "alchemy/Bun";
 * import * as Cloudflare from "alchemy/Cloudflare";
 * import * as Layer from "effect/Layer";
 *
 * export default Alchemy.Stack(
 *   "myStack",
 *   { providers: Layer.merge(Cloudflare.providers(), Bun.providers()) },
 *   program,
 * );
 * ```
 */
export const providers = () =>
  Layer.effect(Providers, Provider.collection([SshDeploy])).pipe(
    Layer.provide(SshDeployProvider()),
    Layer.orDie,
  );
