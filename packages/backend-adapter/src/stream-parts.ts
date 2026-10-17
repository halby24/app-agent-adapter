import type { AgentUsage } from "./types.ts";

/**
 * 値がオブジェクトかどうかを判定する。
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * ツールの内容を表示用に残す最大の文字数。
 */
const MAX_TOOL_TEXT_LENGTH = 4000;

/**
 * ツールが報告した内容を、表示用のテキストにまとめる。
 *
 * acpx（ACPの`content`/`diff`/`terminal`）とPI（`content`）のどちらの形でも、
 * 取り出せるテキストだけを集める。生のペイロードは公開せず、長い内容は切り詰める。
 *
 * @returns 表示できるテキスト。取り出せない場合や空の場合は`undefined`。
 * @internal
 */
export function toToolText(value: unknown): string | undefined {
  const text = collectToolText(value).join("\n");
  if (text === "") {
    return undefined;
  }
  return text.length <= MAX_TOOL_TEXT_LENGTH ? text : `${text.slice(0, MAX_TOOL_TEXT_LENGTH)}…`;
}

function collectToolText(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(collectToolText);
  }
  if (!isRecord(value)) {
    return [];
  }
  if (Array.isArray(value.content)) {
    return value.content.flatMap(collectToolText);
  }

  switch (value.type) {
    case "text":
      return typeof value.text === "string" ? [value.text] : [];
    case "content":
      // ACPのcontentブロックは、入れ子になった内容に実体を持つ。
      return collectToolText(value.content);
    case "diff":
      return [typeof value.path === "string" ? `[diff] ${value.path}` : "[diff]"];
    case "terminal":
      return ["[terminal]"];
    case "image":
      return ["[image]"];
    default:
      return [];
  }
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
