/**
 * プロバイダの選択肢を作る。
 *
 * 種類は`provider`に固定され、IDは指定した文字列のリテラル型として残る。
 */
function providerOption<const Id extends string>(entry: {
  readonly id: Id;
  readonly label: string;
}): {
  readonly kind: "provider";
  readonly id: Id;
  readonly label: string;
} {
  return { kind: "provider", ...entry };
}

/**
 * 組み込みのプロバイダ。
 *
 * 内蔵のコーディングエージェント（PI Coding Agent）で使えるものを列挙する。
 * 画像・音声・動画だけのプロバイダと、コーディングエージェントで使えない
 * プロバイダは対象外とする。
 * この一覧がIDの正本であり、公開する型はここから導出する。
 */
const PROVIDERS = [
  providerOption({ id: "openai", label: "OpenAI" }),
  providerOption({ id: "anthropic", label: "Anthropic" }),
  providerOption({ id: "google", label: "Google" }),
  providerOption({ id: "xai", label: "xAI" }),
  providerOption({ id: "mistral", label: "Mistral" }),
  providerOption({ id: "groq", label: "Groq" }),
  providerOption({ id: "deepseek", label: "DeepSeek" }),
  providerOption({ id: "cerebras", label: "Cerebras" }),
  providerOption({ id: "togetherai", label: "Together AI" }),
  providerOption({ id: "fireworks", label: "Fireworks AI" }),
  providerOption({ id: "moonshotai", label: "Moonshot AI" }),
];

/**
 * 組み込みのハーネス名。
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

/**
 * ハーネスの選択肢を作る。
 *
 * 表示用の別名を定義していないため、IDと同じacpxの組み込み名を表示名にする。
 */
function harnessOption(id: (typeof HARNESS_NAMES)[number]): {
  readonly kind: "harness";
  readonly id: (typeof HARNESS_NAMES)[number];
  readonly label: string;
} {
  return { kind: "harness", id, label: id };
}

const HARNESSES = HARNESS_NAMES.map(harnessOption);

/**
 * 一覧にあるハーネスのID。
 *
 * パッケージの公開APIではなく、同じパッケージ内でハーネスを列挙するために使う。
 *
 * @internal
 */
export const HARNESS_IDS: readonly (typeof HARNESS_NAMES)[number][] = HARNESS_NAMES;

/** 内蔵のエージェントで動かすプロバイダの選択肢。 */
export type ProviderOption = (typeof PROVIDERS)[number];

/** プロバイダを指すID。一覧にある文字列のリテラル型。 */
export type ProviderId = ProviderOption["id"];

/** ACP互換のコーディングエージェント（ハーネス）の選択肢。 */
export type HarnessOption = (typeof HARNESSES)[number];

/**
 * 利用者が選択できるエージェントのバックエンド。
 *
 * {@link listAgentOptions}が返す一覧の要素であり、選択時は{@link AgentSelection}に
 * 広げて、そのバックエンドに必要な指定を加える。
 *
 * - `id`: 一覧内で一意なID。プロバイダは内蔵のエージェントが扱うプロバイダ名に対応し、ハーネスはacpxの組み込み名と一致する。
 * - `label`: 一覧に表示する名前。
 */
export type AgentOption = ProviderOption | HarnessOption;

/**
 * 選択肢の種類。
 *
 * - `provider`: 内蔵のエージェントで動かすプロバイダ。
 * - `harness`: ACP互換のコーディングエージェントをacpx経由で動かす。
 */
export type AgentOptionKind = AgentOption["kind"];

const AGENT_OPTIONS: readonly AgentOption[] = [...PROVIDERS, ...HARNESSES];

/**
 * 一覧にあるプロバイダのID。
 *
 * パッケージの公開APIではなく、同じパッケージ内でプロバイダを列挙するために使う。
 *
 * @internal
 */
export const PROVIDER_IDS: readonly ProviderId[] = PROVIDERS.map((provider) => provider.id);

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
 * @remarks
 * 保存した選択を復元する場合など、一覧の外から来たID文字列を解決するために使う。
 */
export function findAgentOption(id: string): AgentOption | undefined {
  return AGENT_OPTIONS.find((option) => option.id === id);
}
