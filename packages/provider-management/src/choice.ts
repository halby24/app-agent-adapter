import type { AgentOption, HarnessOption, ProviderOption } from "./catalog.ts";

/**
 * プロバイダを選んだこと。
 *
 * 種類ごとに定義する。{@link AgentOption}（union）にまとめて`Pick`すると、
 * `kind`と`id`の対応を型で表せなくなるため。
 */
export type ProviderChoice = Pick<ProviderOption, "kind" | "id">;

/**
 * ハーネスを選んだこと。
 */
export type HarnessChoice = Pick<HarnessOption, "kind" | "id">;

/**
 * 選んだバックエンド。
 *
 * 一覧の{@link AgentOption}から種類とIDだけを取り出したもの。選んだバックエンドを
 * どう動かすか（作業ディレクトリ、モデル、権限など）は利用側の指定なので含まない。
 * IDは一覧にある文字列のリテラル型なので、一覧にないIDはコンパイル時に検出される。
 */
export type AgentChoice = ProviderChoice | HarnessChoice;

/**
 * 一覧で選んだ選択肢から、選択（種類とID）だけを取り出す。
 *
 * @param option - 一覧で選ばれた選択肢。
 * @returns 種類とIDだけを持つ選択。
 */
export function toAgentChoice(option: AgentOption): AgentChoice {
  return option.kind === "provider"
    ? { kind: "provider", id: option.id }
    : { kind: "harness", id: option.id };
}
