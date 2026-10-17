import type { FinishReason } from "ai";
import type { AgentUsage } from "./types.ts";

/**
 * 値がオブジェクトかどうかを判定する。
 *
 * @internal
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * 値がAI SDKの終了理由かどうかを判定する。
 *
 * @internal
 */
export function isFinishReason(value: unknown): value is FinishReason {
  switch (value) {
    case "stop":
    case "length":
    case "content-filter":
    case "tool-calls":
    case "error":
    case "other":
      return true;
    default:
      return false;
  }
}

/**
 * AI SDKのusageから公開API用のトークン数を取り出す。
 *
 * プロバイダが報告しない項目は省略する。
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
