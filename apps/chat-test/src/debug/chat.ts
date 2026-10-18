/**
 * GUIを開かずにチャット経路を試すデバッグCLI。
 *
 * `uniform-interface`の`createChatAgent`で1ターンだけ送り、受け取った内容を
 * NDJSON（1行1JSON）でstdoutに出す。Electrobunのメインプロセスは読み込まないため、
 * ウィンドウは開かず、画面やキーボードのフォーカスを占有しない。
 *
 * 使い方の例:
 *
 * ```bash
 * bun src/debug/chat.ts --kind provider --id openai --model <モデルID> --prompt "こんにちは"
 * bun src/debug/chat.ts --kind harness --id pi --prompt "こんにちは"
 * ```
 *
 * 詳しい引数と出力の形は`apps/chat-test/README.md`を見る。
 *
 * @remarks
 * `--timeout-ms`は送信ターンの打ち切りにだけ使う。セッションの生成には
 * 中断の受け口がないため、生成が止まらない場合の打ち切りは行わない。
 */
import type { HarnessChoice, ProviderId } from "provider-management";
import { parseArgs } from "node:util";
import { AgentError, createChatAgent } from "uniform-interface";
import type { AgentEvent, AgentSession, ChatAgentOptions } from "uniform-interface";
import { apiKeyEnvVarName, environmentApiKey } from "../shared/api-keys.ts";

/** stdoutに出す行。`t`で種別を分ける。 */
type OutputLine =
  | { readonly t: "session"; readonly kind: string; readonly id: string; readonly model?: string }
  | { readonly t: "event"; readonly event: AgentEvent }
  | { readonly t: "error"; readonly name: string; readonly code?: string; readonly message: string }
  | { readonly t: "done"; readonly ok: boolean };

/** 引数の解釈に失敗したときの使い方の表示先。stdoutはJSONだけにする。 */
const usageStream = process.stderr;

/** 使い方を出す。JSONではないためstderrに出す。 */
function printUsage(stream: NodeJS.WritableStream): void {
  stream.write(
    [
      "使い方: bun src/debug/chat.ts --kind provider|harness --id <ID> [options] [--prompt <文> | <文>]",
      "",
      "  --kind provider|harness  使うバックエンドの種類（必須）。",
      "  --id <ID>                バックエンドのID（必須）。プロバイダは`openai`など、",
      "                           ハーネスはacpxの組み込み名（`pi`など）。",
      "  --model <モデルID>       使うモデル。プロバイダでは必須、ハーネスでは省略可",
      "                           （省略時はエージェントの既定）。",
      "  --api-key <キー>         プロバイダのAPIキー。省略時は環境変数から読む。",
      "  --instructions <指示>    すべてのセッションに適用するシステム指示（省略可）。",
      "  --timeout-ms <ミリ秒>    送信ターンの打ち切り時間（省略時は打ち切らない）。",
      "  --prompt <文>            送る1ターン分の文。位置引数でも指定できる。",
      "  --help                   この表示を出す。",
      "",
      "stdoutには次の行だけを出す（1行1JSON）。",
      '  {"t":"session","kind":...,"id":...,"model":...}  セッションの開始（`model`は省略あり）。',
      '  {"t":"event","event":{...}}                     受け取った`AgentEvent`。',
      '  {"t":"error","name":...,"code":...,"message":...}  失敗（`code`は`AgentError`のときだけ）。',
      '  {"t":"done","ok":true|false}                   終了。`finish`まで届いたときだけ`true`。',
      "",
    ].join("\n"),
  );
}

/** 1行のJSONをstdoutに出す。 */
function emit(line: OutputLine): void {
  process.stdout.write(`${JSON.stringify(line)}\n`);
}

/** 例外を出力行のエラーの形に読み替える。 */
function toErrorLine(error: unknown): Extract<OutputLine, { readonly t: "error" }> {
  if (error instanceof AgentError) {
    return { t: "error", name: error.name, code: error.code, message: error.message };
  }
  if (error instanceof Error) {
    return { t: "error", name: error.name, message: error.message };
  }
  return { t: "error", name: "UnknownError", message: String(error) };
}

/**
 * 失敗をJSONで出し、終了コード1で終える。
 *
 * @param error - 失敗の原因。
 * @param showUsage - 使い方もstderrに出すか。引数の指定ミスのときだけ`true`。
 * @returns 終了コード（1）。
 */
function fail(error: unknown, showUsage: boolean): number {
  if (showUsage) {
    printUsage(usageStream);
  }
  emit(toErrorLine(error));
  emit({ t: "done", ok: false });
  return 1;
}

/**
 * 引数の値を文字列として読む。
 *
 * @param value - 解釈した引数の値。
 * @returns 文字列の場合だけその値。それ以外は`undefined`。
 * @remarks
 * `parseArgs`の戻り値は選択肢ごとに絞り込まれないため、ここで実行時に確かめる。
 * 型注釈やアサーションでは実行時の検証にならない。
 */
function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * 文字列の引数を読む。空文字は未指定として扱う。
 *
 * @param value - 解釈した引数の値。
 * @returns 前後の空白を除いた値。未指定や空文字の場合は`undefined`。
 */
function optionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === "" ? undefined : trimmed;
}

/**
 * タイムアウト時間を読む。
 *
 * @param raw - `--timeout-ms`の値。
 * @returns ミリ秒。未指定の場合は`undefined`。
 * @throws `Error` — 数値でない場合や正の数でない場合。
 */
function parseTimeoutMs(raw: string | undefined): number | undefined {
  const text = optionalText(raw);
  if (text === undefined) return undefined;
  const parsed = Number(text);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`--timeout-ms には正のミリ秒を指定してください: ${text}`);
  }
  return parsed;
}

/**
 * CLIを動かす。
 *
 * @returns 終了コード。`finish`まで届いたときだけ0。
 */
async function main(): Promise<number> {
  let values: ReturnType<typeof parseArgs>["values"];
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      args: process.argv.slice(2),
      options: {
        kind: { type: "string" },
        id: { type: "string" },
        model: { type: "string" },
        "api-key": { type: "string" },
        instructions: { type: "string" },
        "timeout-ms": { type: "string" },
        prompt: { type: "string" },
        help: { type: "boolean", default: false },
      },
      allowPositionals: true,
    }));
  } catch (error) {
    return fail(error, true);
  }

  if (values.help === true) {
    printUsage(usageStream);
    return 0;
  }

  const kind = optionalText(stringValue(values.kind));
  if (kind !== "provider" && kind !== "harness") {
    return fail(new Error("--kind には provider か harness を指定してください"), true);
  }
  const id = optionalText(stringValue(values.id));
  if (id === undefined) {
    return fail(new Error("--id を指定してください"), true);
  }
  const model = optionalText(stringValue(values.model));
  if (kind === "provider" && model === undefined) {
    return fail(new Error("プロバイダでは --model を指定してください"), true);
  }
  const prompt = optionalText(stringValue(values.prompt) ?? positionals.join(" "));
  if (prompt === undefined) {
    return fail(new Error("--prompt か位置引数で送る文を指定してください"), true);
  }
  let timeoutMs: number | undefined;
  try {
    timeoutMs = parseTimeoutMs(stringValue(values["timeout-ms"]));
  } catch (error) {
    return fail(error, true);
  }

  let options: ChatAgentOptions;
  if (kind === "provider") {
    // IDは一覧から選ぶ前提なので、ここでリテラル型に絞る。
    const providerId = id as ProviderId;
    const apiKey = optionalText(stringValue(values["api-key"])) ?? environmentApiKey(providerId);
    if (apiKey === undefined) {
      const envName = apiKeyEnvVarName(providerId);
      const hint = envName ? `（--api-key か環境変数 ${envName} で指定）` : "（--api-key で指定）";
      return fail(new Error(`${id} のAPIキーがありません${hint}`), false);
    }
    options = {
      kind: "provider",
      id: providerId,
      // プロバイダでは上記で必須を確認済みのため、`string`として扱う。
      model: model as string,
      apiKey,
      instructions: stringValue(values.instructions),
    };
  } else {
    // IDは一覧から選ぶ前提なので、ここでリテラル型に絞る。
    options = {
      kind: "harness",
      id: id as HarnessChoice["id"],
      model,
      instructions: stringValue(values.instructions),
    };
  }

  let session: AgentSession | undefined;
  try {
    session = await createChatAgent(options).createSession();
  } catch (error) {
    return fail(error, false);
  }
  emit({ t: "session", kind, id, ...(model !== undefined ? { model } : {}) });

  let finished = false;
  const abort = new AbortController();
  const timer = timeoutMs !== undefined ? setTimeout(() => abort.abort(), timeoutMs) : undefined;
  try {
    for await (const event of session.send(prompt, { abortSignal: abort.signal })) {
      if (event.type === "finish") finished = true;
      emit({ t: "event", event });
    }
  } catch (error) {
    emit(toErrorLine(error));
  } finally {
    clearTimeout(timer);
    try {
      await session.close();
    } catch (error) {
      // 後片付けの失敗は送信の成否を変えないが、隠さずに出す。
      emit(toErrorLine(error));
    }
  }
  emit({ t: "done", ok: finished });
  return finished ? 0 : 1;
}

try {
  // stdoutが詰まらないよう、終了コードだけ置いて自然に終える。
  process.exitCode = await main();
} catch (error) {
  // 起動時の想定外の失敗もJSONで返す。stdoutはJSONだけにする。
  emit(toErrorLine(error));
  emit({ t: "done", ok: false });
  process.exitCode = 1;
}
