import { createAgentRegistry } from "acpx/agent-registry";
import type {
  AcpRuntime,
  AcpRuntimeEvent,
  AcpRuntimeHandle,
  AcpRuntimeTurnResult,
  AcpSessionRecord,
  AcpSessionStore,
  SessionAgentOptions,
} from "acpx/runtime";
import { createAcpRuntime } from "acpx/runtime";
import { AgentError } from "./errors.ts";
import { toAgentUsage, toToolText } from "./stream-parts.ts";
import type {
  AcpxAgent,
  AcpxAgentOptions,
  AcpxSessionOptions,
  AgentEvent,
  AgentSession,
  AgentUsage,
  FinishReason,
  SendOptions,
  ToolKind,
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
export function createAcpxAgent(options: AcpxAgentOptions): AcpxAgent {
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
): AcpxAgent {
  return {
    async createSession(sessionOptions?: AcpxSessionOptions): Promise<AgentSession> {
      const sessionAgentOptions = toSessionAgentOptions(
        sessionOptions?.instructions ?? options.instructions,
        sessionOptions?.model ?? options.model,
      );
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
          ...(sessionAgentOptions === undefined ? {} : { sessionOptions: sessionAgentOptions }),
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
 * acpxに渡すセッションの設定を組み立てる。
 *
 * 何も指定がない場合は、セッションの設定を渡さない（acpxに既定を任せる）。
 */
function toSessionAgentOptions(
  instructions: string | undefined,
  model: string | undefined,
): SessionAgentOptions | undefined {
  if (instructions === undefined && model === undefined) {
    return undefined;
  }
  return {
    ...(instructions === undefined ? {} : { systemPrompt: instructions }),
    ...(model === undefined ? {} : { model }),
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
    // ターン内で進行中のツール呼び出し。ACPのtool_callは状態遷移で届くため、
    // IDごとに開始・途中経過・結果へ畳む。
    const toolCalls = new Map<string, "open" | "closed">();

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
          if (part.stream === "thought") {
            // 思考過程を表示するかどうかは利用側が決める。
            yield { type: "reasoning-delta", text: part.text };
            continue;
          }
          text += part.text;
          yield { type: "text-delta", text: part.text };
        } else if (part.type === "status" && part.breakdown !== undefined) {
          usage = toAgentUsage(part.breakdown);
        } else if (part.type === "tool_call") {
          yield* toToolEvents(part, toolCalls);
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

/**
 * ACPのツール分類を、公開APIの分類に対応させる。
 */
const TOOL_KINDS: Partial<Record<string, ToolKind>> = {
  read: "read",
  search: "search",
  edit: "edit",
  delete: "edit",
  move: "edit",
  execute: "execute",
};

/**
 * ACPの`tool_call`イベントを、公開APIのツールのイベントに変換する。
 *
 * ACPは同じ呼び出しを状態遷移（`pending`から`completed`/`failed`まで）で繰り返し通知する。
 * そのため、最初の通知を{@link ToolCallEvent}、終端を{@link ToolResultEvent}、それ以外で
 * 内容が届いたものを{@link ToolCallUpdateEvent}として扱う。
 *
 * @remarks
 * acpxがIDを報告しない場合はアダプタが生成する。この場合、以降の通知とは関連付かない。
 */
function* toToolEvents(
  part: Extract<AcpRuntimeEvent, { type: "tool_call" }>,
  toolCalls: Map<string, "open" | "closed">,
): Generator<AgentEvent> {
  const toolCallId = part.toolCallId ?? crypto.randomUUID();
  const state = toolCalls.get(toolCallId);
  if (state === "closed") {
    // 終端のあとに届いた重複は無視する。
    return;
  }
  if (state === undefined) {
    toolCalls.set(toolCallId, "open");
    yield {
      type: "tool-call",
      toolCallId,
      ...(part.title === undefined ? {} : { title: part.title }),
      ...(part.kind === undefined ? {} : { kind: TOOL_KINDS[part.kind] ?? "other" }),
    };
  }

  const text = toToolText(part.content ?? part.rawOutput);
  if (part.status === "completed" || part.status === "failed") {
    toolCalls.set(toolCallId, "closed");
    yield {
      type: "tool-result",
      toolCallId,
      isError: part.status === "failed",
      ...(text === undefined ? {} : { text }),
    };
  } else if (text !== undefined) {
    yield { type: "tool-call-update", toolCallId, text };
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
