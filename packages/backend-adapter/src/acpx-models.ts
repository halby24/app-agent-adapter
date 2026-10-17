import { createAgentRegistry } from "acpx/agent-registry";
import { inspectAgentModels } from "acpx/runtime";
import type { AcpxModel, AcpxModelsOptions } from "./types.ts";

/**
 * エージェントが利用できるモデルを調べる。
 *
 * @param options - 調べるエージェントと作業ディレクトリ。
 * @returns エージェントが通知したモデルの一覧。エージェントがモデルを通知しない場合は空配列。
 * @throws `Error` — `options.agent`がacpxの組み込み名でない場合。
 * @remarks
 * 一覧を調べるためにエージェントのプロセスを1つ起動する。取得できるのは調査用の
 * プロセスが通知するモデルなので、作業ディレクトリの設定に依存する。エージェントが
 * モデルを通知しない場合は、そもそもモデルを選択できない。
 */
export async function listAcpxModels(options: AcpxModelsOptions): Promise<readonly AcpxModel[]> {
  const models = await inspectAgentModels({
    agentCommand: resolveAgentCommand(options.agent),
    cwd: options.cwd,
    ...(options.abortSignal === undefined ? {} : { signal: options.abortSignal }),
  });

  if (models === undefined) {
    return [];
  }
  return models.availableModels === undefined
    ? models.availableModelIds.map((id) => ({ id }))
    : models.availableModels.map((model) => ({ id: model.modelId, name: model.name }));
}

/**
 * 調査に渡すコマンドをargvに解決する。
 *
 * acpxはコマンド文字列も起動用のコマンドとして受け付けるが、調査にはargvが必要になる。
 * argvを解決できるのは組み込み名だけなので、それ以外は引数側の指定を失敗させる。
 */
function resolveAgentCommand(agent: string): string[] {
  const resolved = createAgentRegistry().resolve(agent);
  if (!Array.isArray(resolved)) {
    throw new Error(`Cannot list models of an agent that has no known argv: ${agent}`);
  }
  return resolved;
}
