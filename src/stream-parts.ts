import type { AgentUsage } from "./types.ts";

/**
 * 値がオブジェクトかどうかを判定する。
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * バックエンドのusageから公開API用のトークン数を取り出す。
 *
 * 報告されない項目は省略する。
 *
 * @internal
 */
export function toAgentUsage(value: unknown): AgentUsage {
  if (!isRecord(value)) {
    return {};
  }

  return {
    inputTokens: toNumber(value.inputTokens),
    outputTokens: toNumber(value.outputTokens),
    totalTokens: toNumber(value.totalTokens),
  };
}

function toNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}
