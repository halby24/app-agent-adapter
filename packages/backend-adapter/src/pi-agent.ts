import type {
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { AgentError } from "./errors.ts";
import { createIsolatedModelRuntime } from "./pi-runtime.ts";
import type { PiModelRuntime } from "./pi-runtime.ts";
import { toToolText } from "./stream-parts.ts";
import type {
  AcpxPermissionMode,
  Agent,
  AgentEvent,
  AgentSession,
  AgentUsage,
  FinishReason,
  PiAgentOptions,
  PiModelSelection,
  SendOptions,
  SessionOptions,
  ToolKind,
} from "./types.ts";

/** 内蔵のPI Coding Agentのセッション。 */
type PiSession = import("@earendil-works/pi-coding-agent").AgentSession;

/** PIが使うモデル。 */
type PiSdkModel = NonNullable<ReturnType<PiModelRuntime["getModel"]>>;

/** PIのセッションが保持するメッセージ。 */
type PiMessage = PiSession["messages"][number];

/** PIのアシスタントメッセージ。 */
type PiAssistantMessage = Extract<PiMessage, { role: "assistant" }>;

/** 読み取りだけを行うツール。 */
const READ_ONLY_TOOLS = ["read", "grep", "find", "ls"] as const;

/**
 * 操作の扱いごとに有効にするツール。
 *
 * acpxの権限モードに揃える。`deny-all`と`approve-reads`は読み取り以外を許可しないため、
 * 同じツール構成になる（PIのツールは実行時に許可を求めるのではなく、渡したものだけが使える）。
 * `approve-all`は読み取りのツールに、書き込みとコマンド実行のツールを加える。
 */
const TOOLS_BY_PERMISSION: Record<AcpxPermissionMode, readonly string[]> = {
  "deny-all": READ_ONLY_TOOLS,
  "approve-reads": READ_ONLY_TOOLS,
  "approve-all": [...READ_ONLY_TOOLS, "bash", "edit", "write"],
};

/**
 * PIのツール名を、公開APIの分類に対応させる。
 *
 * PIが持つツール以外（拡張やMCPのツール）は`"other"`として扱う。
 */
const TOOL_KINDS: Record<string, ToolKind> = {
  read: "read",
  ls: "read",
  grep: "search",
  find: "search",
  edit: "edit",
  write: "edit",
  bash: "execute",
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
      const { DefaultResourceLoader, SessionManager, getAgentDir } =
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

      return startPiSession({
        cwd: options.cwd,
        model: options.model,
        resourceLoader,
        // 会話履歴をディスクに残さない。
        sessionManager: SessionManager.inMemory(options.cwd),
        tools: [...TOOLS_BY_PERMISSION[options.permissionMode ?? "deny-all"]],
      });
    },
  };
}

/**
 * PIのSDKでセッションを生成して公開APIのセッションで包む起動処理。
 *
 * `createPiAgent` とチャット用プロファイルで共有する。呼び出し側は資源の隔離方針
 * （`resourceLoader`、`sessionManager`、`settingsManager`、`agentDir`、ツール選択）を
 * 決めて渡す。ここでは決めない。
 *
 * @param bootstrap - SDKに渡す資源一式。
 * @param onDispose - セッション破棄のあとに実行する後片付け。渡さない場合は何もしない。
 * @returns 公開APIのセッション。
 *
 * @internal
 */
export async function startPiSession(
  bootstrap: PiSessionBootstrap,
  onDispose?: () => Promise<void>,
): Promise<AgentSession> {
  // PIのSDKは依存が多いため、セッションを生成するときに読み込む。
  const { createAgentSession } = await import("@earendil-works/pi-coding-agent");

  // モデルを指定した場合は、PIの設定ではなく指定したモデルとAPIキーを使う。
  const selection = await resolveModel(bootstrap.model);

  const { session } = await createAgentSession({
    cwd: bootstrap.cwd,
    ...(bootstrap.agentDir === undefined ? {} : { agentDir: bootstrap.agentDir }),
    ...(bootstrap.settingsManager === undefined
      ? {}
      : { settingsManager: bootstrap.settingsManager }),
    sessionManager: bootstrap.sessionManager,
    resourceLoader: bootstrap.resourceLoader,
    ...(bootstrap.tools === undefined ? {} : { tools: bootstrap.tools }),
    ...(bootstrap.noTools === undefined ? {} : { noTools: bootstrap.noTools }),
    ...selection,
  });
  return new PiAgentSession(session, onDispose === undefined ? undefined : { onDispose });
}

/**
 * PIのSDKに渡す資源一式。
 *
 * @internal
 */
export interface PiSessionBootstrap {
  /** セッションの作業ディレクトリ。 */
  readonly cwd: string;
  /** 使うモデルとその認証。省略時はPIの設定に従う。 */
  readonly model: PiModelSelection | undefined;
  /** プロンプトや技能などの読み込み方針を固めた資源読み込み器。 */
  readonly resourceLoader: DefaultResourceLoader;
  /** 会話履歴の置き場。 */
  readonly sessionManager: SessionManager;
  /** 動作設定。省略時はPIの既定（ファイル読み込み）に従う。 */
  readonly settingsManager?: SettingsManager;
  /** PIが全体設定を読む置き場。省略時はPIの既定（`~/.pi/agent`）に従う。 */
  readonly agentDir?: string;
  /** 有効にするツール名。`noTools`と同時には指定しない。 */
  readonly tools?: string[];
  /** ツールを既定で無効にする方式。`tools`と同時には指定しない。 */
  readonly noTools?: "all";
}

/**
 * 指定されたモデルと認証を、PIに渡す形に解決する。
 *
 * @returns PIに渡すモデルとランタイム。指定がない場合は`undefined`（PIの設定に従う）。
 * @throws `Error` — PIが扱わないプロバイダやモデルを指定した場合。
 * @remarks
 * APIキーは実行時の上書きとして渡すため、PIの設定ファイルには保存されない。
 */
async function resolveModel(
  selection: PiModelSelection | undefined,
): Promise<{ model: PiSdkModel; modelRuntime: PiModelRuntime } | undefined> {
  if (selection === undefined) {
    return undefined;
  }

  const modelRuntime = await createIsolatedModelRuntime();
  if (modelRuntime.getProvider(selection.provider) === undefined) {
    throw new Error(`PI does not know the provider: ${selection.provider}`);
  }
  await modelRuntime.setRuntimeApiKey(selection.provider, selection.apiKey);

  const model = modelRuntime.getModel(selection.provider, selection.id);
  if (model === undefined) {
    throw new Error(`PI does not know the model: ${selection.provider}/${selection.id}`);
  }
  return { model, modelRuntime };
}

/**
 * 進行中のターンの状態。
 *
 * 反復の継続とは独立に、実行中 `close` が中断と巻き戻しを行えるよう、
 * 完了待ちと巻き戻し先を生成器の外からも扱える形で保持する。
 */
interface PiTurnState {
  /** 実行中の `prompt()`。中断時はこれが落ち着くのを待つ。 */
  readonly run: Promise<void>;
  /** ターン開始前の末尾エントリ。巻き戻し先。履歴が空の場合のみ`null`。 */
  readonly leafBefore: string | null;
  /** 中断と巻き戻しを行ったかどうか。生成器と`close`の二重実行を防ぐ。 */
  cleaned: boolean;
}

/**
 * PIのセッションを公開APIのセッションとして扱う。
 *
 * @internal
 */
class PiAgentSession implements AgentSession {
  readonly #session: PiSession;
  readonly #onDispose?: () => Promise<void>;
  #active = false;
  #closed = false;
  #closing: Promise<void> | undefined;
  #turn: PiTurnState | undefined;

  constructor(session: PiSession, options?: { onDispose?: () => Promise<void> }) {
    this.#session = session;
    this.#onDispose = options?.onDispose;
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
    // 進行中のターンを中断し、巻き戻しまで終わってから破棄する。
    // 反復が放棄されて生成器が再開されなくても、ここで完了を待てるよう
    // 生成器の完了ではなくターンの後片付けを待つ。
    await this.#session.abort().catch(() => {});
    const turn = this.#turn;
    if (turn !== undefined) {
      await this.#cleanupTurn(turn);
    }
    this.#session.dispose();
    await this.#onDispose?.().catch(() => {});
  }

  /**
   * 進行中のターンを中断し、完了を待って、失敗/中断分を履歴から巻き戻す。
   *
   * 生成器の`finally`と`close`のどちらから呼ばれても一度だけ行う。
   */
  async #cleanupTurn(turn: PiTurnState): Promise<void> {
    if (turn.cleaned) {
      return;
    }
    turn.cleaned = true;
    await this.#session.abort().catch(() => {});
    await turn.run.catch(() => {});
    await this.#rollbackTurn(turn.leafBefore);
  }

  /**
   * 失敗/中断したターンを履歴に残さないよう、ターン開始前の末尾まで巻き戻す。
   *
   * PIの`prompt()`は失敗も中断も履歴に残すため、公開契約（失敗や中断のターンは
   * 履歴に残らない）に合わせ、開始前の末尾へ`navigateTree`で戻す。
   * 巻き戻しに失敗してもターンの結果を隠さないよう、例外は握りつぶす。
   */
  async #rollbackTurn(leafBefore: string | null): Promise<void> {
    const manager = this.#session.sessionManager;
    if (manager.getLeafId() === leafBefore) {
      // 履歴に足される前に終わった場合（事前中断や認証失敗など）は戻すものがない。
      return;
    }
    try {
      if (leafBefore !== null) {
        await this.#session.navigateTree(leafBefore, { summarize: false });
        return;
      }
      // 履歴が空のまま失敗した場合は、自分のユーザーメッセージまで戻ると親（`null`）に戻る。
      // 通常はセッション生成時に初期エントリが付くため、こちらは予備の経路である。
      const branch = manager.getBranch();
      for (let index = branch.length - 1; index >= 0; index -= 1) {
        const entry = branch[index];
        if (entry?.type === "message" && entry.message.role === "user") {
          await this.#session.navigateTree(entry.id, { summarize: false });
          return;
        }
      }
    } catch {
      // 巻き戻しは履歴の後片付けであり、ターンの成否を変えない。
    }
  }

  async *#runTurn(input: string, options?: SendOptions): AsyncGenerator<AgentEvent, void, void> {
    if (this.#closed) {
      throw new AgentError("session-closed", "Cannot send a turn to a closed session.");
    }
    if (this.#active) {
      throw new AgentError("session-busy", "The session is still processing the previous turn.");
    }
    if (options?.abortSignal?.aborted) {
      // 事前に中断されている場合は`prompt()`を呼ばず、履歴にも触れない。
      throw new DOMException("The turn was cancelled.", "AbortError");
    }

    this.#active = true;
    const events = new AsyncQueue<AgentEvent>();
    const unsubscribe = this.#session.subscribe((event) => {
      switch (event.type) {
        case "message_update": {
          const update = event.assistantMessageEvent;
          if (update.type === "text_delta") {
            events.push({ type: "text-delta", text: update.delta });
          } else if (update.type === "thinking_delta") {
            // 思考過程を表示するかどうかは利用側が決める。
            events.push({ type: "reasoning-delta", text: update.delta });
          }
          return;
        }
        case "tool_execution_start":
          events.push({
            type: "tool-call",
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            kind: TOOL_KINDS[event.toolName] ?? "other",
          });
          return;
        case "tool_execution_update": {
          const text = toToolText(event.partialResult);
          if (text !== undefined) {
            events.push({ type: "tool-call-update", toolCallId: event.toolCallId, text });
          }
          return;
        }
        case "tool_execution_end": {
          const text = toToolText(event.result);
          events.push({
            type: "tool-result",
            toolCallId: event.toolCallId,
            isError: event.isError,
            durationMs: event.durationMs,
            ...(text === undefined ? {} : { text }),
          });
          return;
        }
        default:
          return;
      }
    });

    const abort = () => {
      void this.#session.abort().catch(() => {});
    };
    const externalSignal = options?.abortSignal;
    externalSignal?.addEventListener("abort", abort, { once: true });

    // ターン開始前の末尾を覚えておき、失敗/中断時はそこまで巻き戻す。
    const leafBefore = this.#session.sessionManager.getLeafId();
    const run = this.#session.prompt(input);
    const turn: PiTurnState = { run, leafBefore, cleaned: false };
    this.#turn = turn;
    let text = "";
    let completed = false;
    try {
      // 未処理の拒否を残さないよう、先に握っておく。
      run.catch(() => {});
      run.then(
        () => events.close(),
        () => events.close(),
      );

      for await (const event of events.iterate()) {
        if (event.type === "text-delta") {
          text += event.text;
        }
        yield event;
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

      completed = true;
      if (this.#turn === turn) {
        this.#turn = undefined;
      }
      yield {
        type: "finish",
        finishReason: toFinishReason(outcome.stopReason),
        usage: toAgentUsage(outcome.message),
        text,
      };
    } finally {
      if (!completed) {
        // 反復の途中終了・失敗・中断時は、実行中の`prompt()`を止めて完了を待つ。
        // 待たずに`#active`を解除すると、次の`send`がPIのキューに積まれて
        // `session-busy`の契約が崩れる。
        await this.#cleanupTurn(turn);
      }
      events.close();
      unsubscribe();
      externalSignal?.removeEventListener("abort", abort);
      if (this.#turn === turn) {
        this.#turn = undefined;
      }
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

/** PIの停止理由を公開APIの終了理由に変換する。 */
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
