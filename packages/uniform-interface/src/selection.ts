import { createAcpxAgent, createModelAgent } from "backend-adapter";
import type { Agent } from "backend-adapter";
import { findAgentOption } from "./catalog.ts";
import type { AgentSelection } from "./types.ts";

/**
 * {@link createAgent}が返す失敗の種類。
 *
 * - `option-not-found`: 一覧にないIDを選択した。
 * - `option-kind-mismatch`: IDは一覧にあるが、{@link AgentOptionKind}が選択と一致しない。
 */
export type AgentSelectionErrorCode = "option-not-found" | "option-kind-mismatch";

/**
 * 選択の指定が一覧と一致しないために失敗した。
 */
export class AgentSelectionError extends Error {
  /** 失敗の種類。 */
  readonly code: AgentSelectionErrorCode;

  /** 選択に指定されたID。 */
  readonly id: string;

  /**
   * @param code - 失敗の種類。
   * @param id - 選択に指定されたID。
   * @param message - 利用者向けの説明。
   */
  constructor(code: AgentSelectionErrorCode, id: string, message: string) {
    super(message);
    this.name = "AgentSelectionError";
    this.code = code;
    this.id = id;
  }
}

/**
 * 一覧から選んだバックエンドのエージェントを生成する。
 *
 * @param selection - 選択した選択肢と、そのバックエンドに必要な指定。
 * @returns 選択したバックエンドのエージェント。利用方法は選択した種類によらず同じ。
 * @throws `AgentSelectionError` — `selection.id`が一覧にない場合（`option-not-found`）、
 * または一覧の種類と`selection.kind`が一致しない場合（`option-kind-mismatch`）。
 * @remarks
 * セッションの生成はエージェントの{@link Agent.createSession}で行う。プロバイダを選んだ場合は
 * 渡したモデルがそのまま使われ、ハーネスを選んだ場合はacpxがセッションごとにエージェントを起動する。
 */
export function createAgent(selection: AgentSelection): Agent {
  const option = findAgentOption(selection.id);
  if (option === undefined) {
    throw new AgentSelectionError(
      "option-not-found",
      selection.id,
      `一覧にない選択肢です: ${selection.id}`,
    );
  }
  if (option.kind !== selection.kind) {
    throw new AgentSelectionError(
      "option-kind-mismatch",
      selection.id,
      `選択肢${selection.id}の種類は${option.kind}です: ${selection.kind}`,
    );
  }

  return selection.kind === "provider"
    ? createModelAgent({ model: selection.model, instructions: selection.instructions })
    : createAcpxAgent({
        agent: selection.id,
        cwd: selection.cwd,
        instructions: selection.instructions,
        permissionMode: selection.permissionMode,
      });
}
