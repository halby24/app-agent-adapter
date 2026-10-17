import { createAgentRegistry } from "acpx/agent-registry";
import type {
  AcpRuntime,
  AcpRuntimeHandle,
  AcpRuntimeTurnResult,
  AcpSessionRecord,
  AcpSessionStore,
} from "acpx/runtime";
import { createAcpRuntime } from "acpx/runtime";
import type { FinishReason } from "ai";
import { AgentError } from "./errors.ts";
import { toAgentUsage } from "./stream-parts.ts";
import type {
  AcpxAgentOptions,
  Agent,
  AgentEvent,
  AgentSession,
  AgentUsage,
  SendOptions,
  SessionOptions,
} from "./types.ts";

/**
 * acpx経由でACP互換のコーディングエージェントを動かすエージェントを生成する。
 *
 * @param options - 起動するエージェントと、全セッション共通の設定。
 * @returns セッションを生成できるエージェント。
 * @remarks
 * `{@link AgentSession.createSession}`ごとにacpxのin-processランタイムを1つ生成し、
 * `{@link AgentSession.close}`でそのランタイムごと破棄する。会話履歴は
 * アダプタが保持するインメモリのセッションストアにのみ存在し、`~/.acpx`などに
 * 永続化されない。エージェント本体のインストールと認証は利用者が済ませておく必要がある。
 */
export function createAcpxAgent(options: AcpxAgentOptions): Agent {
  return createAcpxBackedAgent(
    () =>
      createAcpRuntime({
        cwd: options.cwd,
        sessionStore: createMemorySessionStore(),
        agentRegistry: createAgentRegistry(),
        permissionMode: options.permissionMode ?? "deny-all",
      }),
    options,
  );
}

/**
 * 任意のacpxランタイムをエージェントとして扱う。
 *
 * 公開APIではなく、テストからランタイムを差し替えるための入口。
 *
 * @internal
 */
export function createAcpxBackedAgent(
  createRuntime: () => AcpRuntime,
  options: AcpxAgentOptions,
): Agent {
  return {
    async createSession(sessionOptions?: SessionOptions): Promise<AgentSession> {
      const instructions = sessionOptions?.instructions ?? options.instructions;
      const runtime = createRuntime();
      try {
        const handle = await runtime.ensureSession({
          sessionKey: crypto.randomUUID(),
          agent: options.agent,
          // ターンをまたいでACP接続を維持するためpersistentを使う。oneshotは
          // ターンごとに接続を閉じ、復帰できない場合は新しいセッションを
          // 黙って始めるため、複数ターンの会話を保証できない。
          // 記録先はインメモリのストアなのでディスクには残らない。
          mode: "persistent",
          cwd: options.cwd,
          ...(instructions === undefined ? {} : { sessionOptions: { systemPrompt: instructions } }),
        });
        return new AcpxAgentSession(runtime, handle);
      } catch (error) {
        await runtime.shutdown?.().catch(() => {});
        throw error;
      }
    },
  };
}

/**
 * acpxのセッションを公開APIのセッションとして扱う。
 *
 * @internal
 */
class AcpxAgentSession implements AgentSession {
  readonly #runtime: AcpRuntime;
  readonly #handle: AcpRuntimeHandle;
  #active = false;
  #closed = false;
  #abortController: AbortController | undefined;
  #closing: Promise<void> | undefined;

  constructor(runtime: AcpRuntime, handle: AcpRuntimeHandle) {
    this.#runtime = runtime;
    this.#handle = handle;
  }

  send(input: string, options?: SendOptions): AsyncIterable<AgentEvent> {
    return this.#runTurn(input, options);
  }

  close(): Promise<void> {
    this.#closed = true;
    this.#abortController?.abort();
    this.#closing ??= this.#close();
    return this.#closing;
  }

  async #close(): Promise<void> {
    try {
      await this.#runtime.close({
        handle: this.#handle,
        reason: "The session was closed by the adapter.",
      });
    } finally {
      await this.#runtime.shutdown?.();
    }
  }

  async *#runTurn(input: string, options?: SendOptions): AsyncGenerator<AgentEvent, void, void> {
    if (this.#closed) {
      throw new AgentError("session-closed", "Cannot send a turn to a closed session.");
    }
    if (this.#active) {
      throw new AgentError("session-busy", "The session is still processing the previous turn.");
    }

    this.#active = true;
    const abortController = new AbortController();
    this.#abortController = abortController;

    const externalSignal = options?.abortSignal;
    const onAbort = () => abortController.abort(externalSignal?.reason);
    if (externalSignal?.aborted) {
      abortController.abort(externalSignal.reason);
    } else {
      externalSignal?.addEventListener("abort", onAbort, { once: true });
    }

    let completed = false;
    let text = "";
    let usage: AgentUsage = {};

    try {
      const turn = this.#runtime.startTurn({
        handle: this.#handle,
        text: input,
        mode: "prompt",
        requestId: crypto.randomUUID(),
        signal: abortController.signal,
      });
      // 反復を途中でやめても未処理の拒否を残さないよう、先に握っておく。
      const result = turn.result;
      result.catch(() => {});

      for await (const part of turn.events) {
        if (part.type === "text_delta") {
          // 思考過程はモデルの回答ではないため公開しない。
          if (part.stream === "thought") {
            continue;
          }
          text += part.text;
          yield { type: "text-delta", text: part.text };
        } else if (part.type === "status" && part.breakdown !== undefined) {
          usage = toAgentUsage(part.breakdown);
        }
      }

      const finishReason = await settleTurn(result);
      completed = true;
      yield { type: "finish", finishReason, usage, text };
    } finally {
      if (!completed) {
        abortController.abort();
      }
      externalSignal?.removeEventListener("abort", onAbort);
      this.#abortController = undefined;
      this.#active = false;
    }
  }
}

async function settleTurn(result: Promise<AcpRuntimeTurnResult>): Promise<FinishReason> {
  const settled = await result;
  switch (settled.status) {
    case "completed":
      return toFinishReason(settled.stopReason);
    case "cancelled":
      throw new DOMException("The turn was cancelled.", "AbortError");
    case "failed":
      throw new AgentError("turn-failed", settled.error.message, { cause: settled.error });
  }
}

function toFinishReason(stopReason: string | undefined): FinishReason {
  switch (stopReason) {
    case "max_tokens":
      return "length";
    case "refusal":
      return "content-filter";
    case "end_turn":
    case undefined:
      return "stop";
    default:
      return "other";
  }
}

/**
 * ディスクに書き込まないセッションストア。
 *
 * @internal
 */
function createMemorySessionStore(): AcpSessionStore {
  const records = new Map<string, AcpSessionRecord>();
  return {
    load(sessionId: string): Promise<AcpSessionRecord | undefined> {
      return Promise.resolve(records.get(sessionId));
    },
    save(record: AcpSessionRecord): Promise<void> {
      records.set(record.acpxRecordId, record);
      return Promise.resolve();
    },
  };
}
