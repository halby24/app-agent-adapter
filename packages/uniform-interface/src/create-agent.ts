import type { Agent } from "backend-adapter";
import { createAcpxAgent, createModelAgent } from "backend-adapter";
import type { AgentSelection } from "provider-management";

/**
 * 選んだバックエンドのエージェントを生成する。
 *
 * @param selection - 選択したバックエンドの指定。`provider-management`が組み立てる。
 * @returns 選択したバックエンドのエージェント。利用方法は選択した種類によらず同じ。
 * @remarks
 * セッションの生成はエージェントの{@link Agent.createSession}で行う。プロバイダを選んだ場合は
 * 渡したモデルがそのまま使われ、ハーネスを選んだ場合はacpxがセッションごとにエージェントを起動する。
 */
export function createAgent(selection: AgentSelection): Agent {
  return selection.kind === "provider"
    ? createModelAgent({ model: selection.model, instructions: selection.instructions })
    : createAcpxAgent({
        agent: selection.id,
        cwd: selection.cwd,
        instructions: selection.instructions,
        model: selection.model,
        permissionMode: selection.permissionMode,
      });
}
