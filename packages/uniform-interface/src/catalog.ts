import type { AgentOption, HarnessOption, ProviderOption } from "./types.ts";

/**
 * 組み込みのプロバイダ。
 *
 * AI SDKの公式プロバイダのうち、言語モデルを提供するものを列挙する。
 * 画像・音声・動画だけのプロバイダは対象外とする。
 * モデルの生成（＝APIキーなどの認証）はアプリ側の責務なので、選択に必要な
 * AI SDKパッケージ名だけを持ち、パッケージ自体には依存しない。
 */
const PROVIDERS: readonly ProviderOption[] = [
  { kind: "provider", id: "openai", label: "OpenAI", package: "@ai-sdk/openai" },
  { kind: "provider", id: "anthropic", label: "Anthropic", package: "@ai-sdk/anthropic" },
  { kind: "provider", id: "google", label: "Google", package: "@ai-sdk/google" },
  {
    kind: "provider",
    id: "google-vertex",
    label: "Google Vertex AI",
    package: "@ai-sdk/google-vertex",
  },
  {
    kind: "provider",
    id: "amazon-bedrock",
    label: "Amazon Bedrock",
    package: "@ai-sdk/amazon-bedrock",
  },
  { kind: "provider", id: "azure", label: "Azure OpenAI", package: "@ai-sdk/azure" },
  { kind: "provider", id: "xai", label: "xAI", package: "@ai-sdk/xai" },
  { kind: "provider", id: "mistral", label: "Mistral", package: "@ai-sdk/mistral" },
  { kind: "provider", id: "groq", label: "Groq", package: "@ai-sdk/groq" },
  { kind: "provider", id: "deepseek", label: "DeepSeek", package: "@ai-sdk/deepseek" },
  { kind: "provider", id: "cerebras", label: "Cerebras", package: "@ai-sdk/cerebras" },
  { kind: "provider", id: "cohere", label: "Cohere", package: "@ai-sdk/cohere" },
  { kind: "provider", id: "togetherai", label: "Together AI", package: "@ai-sdk/togetherai" },
  { kind: "provider", id: "fireworks", label: "Fireworks AI", package: "@ai-sdk/fireworks" },
  { kind: "provider", id: "deepinfra", label: "DeepInfra", package: "@ai-sdk/deepinfra" },
  { kind: "provider", id: "perplexity", label: "Perplexity", package: "@ai-sdk/perplexity" },
  { kind: "provider", id: "alibaba", label: "Alibaba", package: "@ai-sdk/alibaba" },
  { kind: "provider", id: "moonshotai", label: "Moonshot AI", package: "@ai-sdk/moonshotai" },
  {
    kind: "provider",
    id: "openai-compatible",
    label: "OpenAI Compatible",
    package: "@ai-sdk/openai-compatible",
  },
];

/**
 * 組み込みのハーネス。
 *
 * acpxの組み込みエージェント名をそのまま列挙する。一覧に載せるかどうかの判断は
 * このパッケージが持ち、acpxの対応エージェントの正本はacpx側にある。
 * acpxがエージェントを追加・改名した場合はこの一覧の見直しが必要になる。
 */
const HARNESS_NAMES = [
  "claude",
  "codex",
  "gemini",
  "copilot",
  "cursor",
  "opencode",
  "qwen",
  "kimi",
  "droid",
  "kilocode",
  "kiro",
  "trae",
  "devin",
  "junie",
  "iflow",
  "grok-build",
  "antigravity",
  "fast-agent",
  "mux",
  "pool",
  "qoder",
  "openclaw",
  "zeroclaw",
  "mcode",
  "fx",
  "pi",
] as const;

const HARNESSES: readonly HarnessOption[] = HARNESS_NAMES.map((id) => ({
  kind: "harness",
  id,
  label: id,
}));

const AGENT_OPTIONS: readonly AgentOption[] = [...PROVIDERS, ...HARNESSES];

/**
 * 選択できるエージェントのバックエンドを列挙する。
 *
 * @returns 組み込みの{@link AgentOption}の一覧。呼び出しごとに同じ内容を返す。
 */
export function listAgentOptions(): readonly AgentOption[] {
  return AGENT_OPTIONS;
}

/**
 * IDに一致する選択肢を探す。
 *
 * @param id - 探す{@link AgentOption}のID。
 * @returns 一致する選択肢。該当がなければ`undefined`。
 */
export function findAgentOption(id: string): AgentOption | undefined {
  return AGENT_OPTIONS.find((option) => option.id === id);
}
