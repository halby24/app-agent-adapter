/**
 * 利用できるプロバイダ、ハーネスと、そのモデルの管理。
 *
 * アプリが選べるバックエンド（AI SDKのプロバイダとACP互換のハーネス）を
 * {@link listAgentOptions}で列挙し、選んだバックエンドの指定を{@link AgentSelection}に
 * まとめる。ハーネスが利用できるモデルは{@link listAcpxModels}で調べる。
 * 選んだバックエンドでエージェントを動かすのは利用側の役割で、このパッケージは
 * エージェントを生成しない。
 *
 * @packageDocumentation
 */
export { findAgentOption, listAgentOptions } from "./catalog.ts";
export type { AgentOption, AgentOptionKind, HarnessOption, ProviderOption } from "./catalog.ts";
export { listAcpxModels } from "./acpx-models.ts";
export type { AcpxModel, AcpxModelsOptions } from "./acpx-models.ts";
export type { AgentSelection, HarnessSelection, ProviderSelection } from "./selection.ts";
export type { AcpxPermissionMode } from "backend-adapter";
