import type { FinishReason } from "ai";
import { AgentError } from "./errors.ts";
import type {
  AcpxPermissionMode,
  Agent,
  AgentEvent,
  AgentSession,
  AgentUsage,
  PiAgentOptions,
  SendOptions,
  SessionOptions,
} from "./types.ts";

/** 内蔵のPI Coding Agentのセッション。 */
type PiSession = import("@earendil-works/pi-coding-agent").AgentSession;

/** PIのセッションが保持するメッセージ。 */
type PiMessage = PiSession["messages"][number];

/** PIのアシスタントメッセージ。 */
type PiAssistantMessage = Extract<PiMessage, { role: "assistant" }>;

/**
 * 操作の扱いごとに有効にするツール。
 *
 * acpxの権限モードに揃える。`deny-all`と`approve-reads`は読み取り以外を許可しないため、
 * 同じツール構成になる（PIのツールは実行時に許可を求めるのではなく、渡したものだけが使える）。
 */
const TOOLS_BY_PERMISSION: Record<AcpxPermissionMode, readonly string[]> = {
  "deny-all": ["read", "grep", "find", "ls"],
  "approve-reads": ["read", "grep", "find", "ls"],
  "approve-all": ["read", "bash", "edit", "write"],
};

/**
 * 内蔵のPI Coding Agentを動かすエージェントを生成する。
 *
 * @param options - 作業ディレクトリと、全セッション共通の設定。
 * @returns セッションを生成できるエージェント。
 * @remarks
 * セッションはPIのSDKでプロセス内に生成し、`{@link AgentSession.close}`で破棄する。
 * 会話履歴はセッションのメモリ上にのみ存在し、ディスクには残さない。モデルとその認証は
 * PI側の設定に従う。
 */
export function createPiAgent(options: PiAgentOptions): Agent {
  return {
    async createSession(sessionOptions?: SessionOptions): Promise<AgentSession> {
      // PIのSDKは依存が多いため、セッションを生成するときに読み込む。
      const { DefaultResourceLoader, SessionManager, createAgentSession, getAgentDir } =
        await import("@earendil-works/pi-coding-agent");
      const instructions = sessionOptions?.instructions ?? options.instructions;
      const resourceLoader = new DefaultResourceLoader({
        cwd: options.cwd,
        agentDir: getAgentDir(),
        ...(instructions === undefined
          ? {}
          : {
              // acpxのsystemPromptと同じく、PIの既定のプロンプトを置き換える。
              systemPromptOverride: () => instructions,
              // 置き換える場合は、PIが既定で足す追加指示（APPEND_SYSTEM.md）を足さない。
              appendSystemPromptOverride: () => [],
            }),
      });
      // 読み込みを確定させる。これを呼ばないと、上の指定はプロンプトに反映されない。
      await resourceLoader.reload();

      const { session } = await createAgentSession({
        cwd: options.cwd,
        // 会話履歴をディスクに残さない。
        sessionManager: SessionManager.inMemory(options.cwd),
        resourceLoader,
        tools: [...TOOLS_BY_PERMISSION[options.permissionMode ?? "deny-all"]],
      });
      return new PiAgentSession(session);
    },
  };
}

/**
 * PIのセッションを公開APIのセッションとして扱う。
 *
 * @internal
 */
class PiAgentSession implements AgentSession {
  readonly #session: PiSession;
  #active = false;
  #closed = false;
  #closing: Promise<void> | undefined;

  constructor(session: PiSession) {
    this.#session = session;
  }

  send(input: string, options?: SendOptions): AsyncIterable<AgentEvent> {
    return this.#runTurn(input, options);
  }

  close(): Promise<void> {
    this.#closed = true;
    this.#closing ??= this.#close();
    return this.#closing;
  }

  async #close(): Promise<void> {
    // 進行中のターンを中断してから破棄する。
    await this.#session.abort().catch(() => {});
    this.#session.dispose();
  }

  async *#runTurn(input: string, options?: SendOptions): AsyncGenerator<AgentEvent, void, void> {
    if (this.#closed) {
      throw new AgentError("session-closed", "Cannot send a turn to a closed session.");
    }
    if (this.#active) {
      throw new AgentError("session-busy", "The session is still processing the previous turn.");
    }

    this.#active = true;
    const deltas = new AsyncQueue<string>();
    const unsubscribe = this.#session.subscribe((event) => {
      if (event.type !== "message_update") {
        return;
      }
      // 思考過程はモデルの回答ではないため公開しない。
      if (event.assistantMessageEvent.type === "text_delta") {
        deltas.push(event.assistantMessageEvent.delta);
      }
    });

    const abort = () => {
      void this.#session.abort().catch(() => {});
    };
    const externalSignal = options?.abortSignal;
    if (externalSignal?.aborted) {
      abort();
    } else {
      externalSignal?.addEventListener("abort", abort, { once: true });
    }

    let text = "";
    try {
      const run = this.#session.prompt(input);
      // 未処理の拒否を残さないよう、先に握っておく。
      run.catch(() => {});
      run.then(
        () => deltas.close(),
        () => deltas.close(),
      );

      for await (const delta of deltas.iterate()) {
        text += delta;
        yield { type: "text-delta", text: delta };
      }
      await run;

      const outcome = readOutcome(this.#session.messages);
      if (outcome === undefined) {
        throw new AgentError("turn-failed", "The agent finished the turn without a response.");
      }
      if (outcome.stopReason === "aborted" || externalSignal?.aborted) {
        throw new DOMException("The turn was cancelled.", "AbortError");
      }
      if (outcome.stopReason === "error") {
        throw new AgentError("turn-failed", outcome.errorMessage ?? "The agent failed the turn.", {
          cause: outcome.message,
        });
      }

      yield {
        type: "finish",
        finishReason: toFinishReason(outcome.stopReason),
        usage: toAgentUsage(outcome.message),
        text,
      };
    } finally {
      deltas.close();
      unsubscribe();
      externalSignal?.removeEventListener("abort", abort);
      this.#active = false;
    }
  }
}

/** ターンの結果を、最後のアシスタントメッセージから読む。 */
function readOutcome(messages: readonly PiMessage[]):
  | {
      stopReason: PiAssistantMessage["stopReason"];
      errorMessage: string | undefined;
      message: PiAssistantMessage;
    }
  | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "assistant") {
      return { stopReason: message.stopReason, errorMessage: message.errorMessage, message };
    }
  }
  return undefined;
}

/** PIが報告したトークン数。 */
function toAgentUsage(message: PiAssistantMessage): AgentUsage {
  return {
    inputTokens: message.usage.input,
    outputTokens: message.usage.output,
    totalTokens: message.usage.totalTokens,
  };
}

/** PIの停止理由をAI SDKの終了理由に変換する。 */
function toFinishReason(stopReason: string): FinishReason {
  switch (stopReason) {
    case "stop":
      return "stop";
    case "length":
      return "length";
    case "toolUse":
      return "tool-calls";
    case "error":
      return "error";
    default:
      // "pending"や"deferred"は、ターンが終わった時点では報告されない。
      return "other";
  }
}

/**
 * コールバックで届く値を非同期イテレータに変換する。
 *
 * @internal
 */
class AsyncQueue<T> {
  readonly #items: T[] = [];
  #notify: (() => void) | undefined;
  #closed = false;

  push(item: T): void {
    if (this.#closed) {
      return;
    }
    this.#items.push(item);
    this.#notify?.();
  }

  close(): void {
    this.#closed = true;
    this.#notify?.();
  }

  async *iterate(): AsyncGenerator<T, void, void> {
    while (true) {
      while (this.#items.length > 0) {
        const item = this.#items.shift();
        if (item !== undefined) {
          yield item;
        }
      }
      if (this.#closed) {
        return;
      }
      await new Promise<void>((resolve) => {
        this.#notify = resolve;
      });
      this.#notify = undefined;
    }
  }
}
