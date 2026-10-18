/**
 * プロバイダのAPIキーを読む環境変数の一覧。
 *
 * チャットテストアプリのメインプロセスとデバッグCLIで共有する。キーの入手
 * （環境変数、キーチェーン、利用者による入力など）はアプリ側の責務なので、
 * このアプリが対応する範囲をここで決める。画面や引数で入力されたキーが優先される。
 */
import type { ProviderId } from "provider-management";

/** プロバイダIDと、それを読む環境変数名の対応。 */
export const API_KEY_ENV_VARS: Readonly<Record<ProviderId, string>> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
  xai: "XAI_API_KEY",
  mistral: "MISTRAL_API_KEY",
  groq: "GROQ_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  cerebras: "CEREBRAS_API_KEY",
  togetherai: "TOGETHER_API_KEY",
  fireworks: "FIREWORKS_API_KEY",
  moonshotai: "MOONSHOT_API_KEY",
};

/**
 * プロバイダのAPIキーを読む環境変数名を返す。
 *
 * @param providerId - カタログのプロバイダID。
 * @returns 対応する環境変数名。一覧にないIDの場合は`undefined`。
 */
export function apiKeyEnvVarName(providerId: string): string | undefined {
  // 呼び出し元はIDを文字列として扱うため、ここでは絞り込まずに照合する。
  // 一覧にないIDは対応する環境変数がないので、未設定として扱う。
  return (API_KEY_ENV_VARS as Readonly<Record<string, string>>)[providerId];
}

/**
 * 環境変数からプロバイダのAPIキーを読む。
 *
 * @param providerId - カタログのプロバイダID。一覧にないIDの場合は`undefined`を返す。
 * @returns 環境変数の値。未設定や空文字の場合は`undefined`。
 */
export function environmentApiKey(providerId: string): string | undefined {
  const name = apiKeyEnvVarName(providerId);
  const value = name ? process.env[name] : undefined;
  return value === undefined || value === "" ? undefined : value;
}
