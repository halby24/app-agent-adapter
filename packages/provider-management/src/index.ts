/**
 * 利用できるプロバイダ、ハーネスと、そのモデルの管理。
 *
 * アプリが選べるバックエンド（AI SDKのプロバイダとACP互換のハーネス）を
 * {@link listAgentOptions}で列挙し、選んだものを{@link AgentChoice}（種類とID）として表す。
 * ハーネスが利用できるかは{@link listAcpxHarnesses}で調べ、モデルは{@link listModels}で
 * 列挙し、{@link createProviderModel}で組み立てる。プロバイダのAPIキーは
 * {@link createApiKeyStore}で保持する。
 *
 * どのモデルをどのバックエンドが動かすかはこのパッケージが吸収する。選んだバックエンドを
 * どう動かすか（作業ディレクトリ、権限、チャット／エージェントの使い分け）は扱わず、
 * エージェントの生成は利用側の役割。
 *
 * @packageDocumentation
 */
export { findAgentOption, listAgentOptions } from "./catalog.ts";
export type {
  AgentOption,
  AgentOptionKind,
  HarnessOption,
  ProviderId,
  ProviderOption,
} from "./catalog.ts";
export { toAgentChoice } from "./choice.ts";
export type { AgentChoice, HarnessChoice, ProviderChoice } from "./choice.ts";
export { createApiKeyStore } from "./api-keys.ts";
export type { ApiKeyStore, ApiKeys } from "./api-keys.ts";
export { listModels, toBackendProviderId } from "./models.ts";
export type { ListModelsOptions, ModelOption } from "./models.ts";
export { createProviderModel } from "./provider-model.ts";
export type { ProviderModelOptions } from "./provider-model.ts";
export { listAcpxHarnesses } from "./acpx-harnesses.ts";
export type { AcpxHarness, AcpxHarnessStatus } from "./acpx-harnesses.ts";
export type { AcpxPermissionMode } from "backend-adapter";
