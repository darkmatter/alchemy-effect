import type { EnvFieldKind, EnvFieldMetadata, RequiredIn } from "./Types.ts";

export type DefaultRequired = "all";
export type DefaultOptionalRequired = readonly [];

type RequiredInOf<Options, Default extends RequiredIn> = Options extends {
  readonly requiredIn: infer Required extends RequiredIn;
}
  ? Required
  : Default;

type BindToWorkerOf<Options> = Options extends {
  readonly bindToWorker: infer BindToWorker extends boolean;
}
  ? BindToWorker
  : true;

export type MetadataFor<
  Kind extends EnvFieldKind,
  Options,
  Default extends RequiredIn,
  Value = unknown,
> = EnvFieldMetadata<
  Kind,
  RequiredInOf<Options, Default>,
  Value,
  BindToWorkerOf<Options>
>;
