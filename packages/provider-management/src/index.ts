/**
 * 利用できるプロバイダ、ハーネスと、そのモデルの管理。
 *
 * アプリが選べるバックエンド（AI SDKのプロバイダとACP互換のハーネス）を
 * {@link listAgentOptions}で列挙し、選んだものを{@link AgentChoice}（種類とID）として
 * 表す。ハーネスが利用できるかは{@link listAcpxHarnesses}、モデルは
 * {@link listProviderModels}と{@link listAcpxModels}で調べ、プロバイダのAPIキーは
 * {@link createApiKeyStore}で保持する。
 *
 * 選んだバックエンドをどう動かすか（作業ディレクトリ、モデル、権限など）は扱わず、
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
export { listAcpxModels } from "./acpx-models.ts";
export type { AcpxModel, AcpxModelsOptions } from "./acpx-models.ts";
export { listAcpxHarnesses } from "./acpx-harnesses.ts";
export type { AcpxHarness, AcpxHarnessStatus } from "./acpx-harnesses.ts";
export { listProviderModels } from "./provider-models.ts";
export type { ProviderModel, ProviderModelsOptions } from "./provider-models.ts";
export type { AcpxPermissionMode } from "backend-adapter";
