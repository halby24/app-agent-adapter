import type { Experimental_SandboxSession, FinishReason, LanguageModel } from "ai";

/**
 * 言語モデルを直接呼び出すエージェントの構成。
 */
export interface ModelAgentOptions {
  /**
   * ターンの生成に使用する言語モデル。
   *
   * AI SDKのプロバイダから取得したモデルを渡す。モデルの切り替えはエージェント単位で行う。
   */
  readonly model: LanguageModel;

  /**
   * すべてのセッションに適用するシステム指示。
   *
   * @defaultValue 省略時はシステム指示を送信しない。
   */
  readonly instructions?: string;
}

/**
 * セッション生成時に適用する設定。
 */
export interface SessionOptions {
  /**
   * このセッションだけに適用するシステム指示。
   *
   * @defaultValue 省略時は {@link ModelAgentOptions.instructions} を継承する。
   */
  readonly instructions?: string;
}

/**
 * 1ターンの送信時に適用する設定。
 */
export interface SendOptions {
  /**
   * ターンを中断するためのシグナル。
   *
   * @remarks
   * 中断されたターンは会話履歴に反映しない。中断はイテレーションの例外として通知される。
   */
  readonly abortSignal?: AbortSignal;
}

/** モデルが生成したテキストの断片。 */
export interface TextDeltaEvent {
  readonly type: "text-delta";

  /**
   * 直前の断片に続けて表示するテキスト。
   *
   * 空文字になる場合がある。断片の連結順はモデルの出力順と一致する。
   */
  readonly text: string;
}

/** 1ターンで使用したトークン数。 */
export interface AgentUsage {
  /** 入力トークン数。プロバイダが報告しない場合は省略される。 */
  readonly inputTokens?: number;

  /** 出力トークン数。プロバイダが報告しない場合は省略される。 */
  readonly outputTokens?: number;

  /** 入力と出力の合計トークン数。プロバイダが報告しない場合は省略される。 */
  readonly totalTokens?: number;
}

/** 1ターンの完了を表すイベント。 */
export interface FinishEvent {
  readonly type: "finish";

  /** モデルが生成を終了した理由。 */
  readonly finishReason: FinishReason;

  /** このターンで使用したトークン数。 */
  readonly usage: AgentUsage;

  /** このターンで生成されたテキスト全体。 */
  readonly text: string;
}

/**
 * {@link AgentSession.send}が返すイベント。
 *
 * `text-delta`が0個以上続いたあと、正常終了時は`finish`が1個届く。
 */
export type AgentEvent = TextDeltaEvent | FinishEvent;

/**
 * エージェントの構成。
 *
 * 構成はエージェントの生成時に固定され、セッション間で共有される。
 */
export interface Agent {
  /**
   * 独立した会話履歴を持つセッションを生成する。
   *
   * @param options - セッション固有の設定。省略時はエージェントの設定を継承する。
   * @returns 生成されたセッション。利用後は必ず{@link AgentSession.close}を呼ぶ。
   * @remarks
   * セッションは会話履歴をメモリに保持する。プロセス終了やセッションの破棄で履歴は失われ、復元できない。
   */
  createSession(options?: SessionOptions): Promise<AgentSession>;
}

/**
 * 1つの会話履歴を保持するエージェントセッション。
 *
 * セッション内で{@link AgentSession.send}を繰り返すと、それまでのユーザーメッセージとモデルの応答が
 * 次のターンの入力に含まれる。セッションをまたいだ履歴の共有は行わない。
 */
export interface AgentSession {
  /**
   * 1ターン分の入力を送信し、モデルの出力を逐次返す。
   *
   * @param input - モデルに送るユーザーメッセージ。
   * @param options - ターン固有の設定。
   * @returns モデルの出力イベントを順に返すイテラブル。
   * @throws `AgentError` — セッションが閉じている場合（`session-closed`）、
   * または前のターンが進行中の場合（`session-busy`）。
   * @remarks
   * リクエストは返されたイテラブルの反復を開始した時点で送信される。反復を途中で終了すると、
   * 進行中のリクエストを中断する。
   * ターンが正常に完了した場合のみ、ユーザーメッセージと応答を履歴に追加する。
   * 例外で終了したターンや中断したターンは履歴に残らない。
   */
  send(input: string, options?: SendOptions): AsyncIterable<AgentEvent>;

  /**
   * セッションを閉じ、進行中のターンを中断する。
   *
   * @returns セッションが閉じたときに完了するPromise。
   * @remarks
   * 複数回呼んでも安全。閉じたセッションの{@link AgentSession.send}は
   * `AgentError`（`session-closed`）を投げる。
   */
  close(): Promise<void>;
}

/**
 * HarnessAgentが利用するsandbox sessionの契約。
 *
 * `@ai-sdk/harness`のsandbox session（`@ai-sdk/sandbox-vercel`などが返すもの）がそのまま適合する。
 * `{@link createHarnessAgent}`はセッション終了時に`destroy`を呼ぶ。
 */
export type HarnessSandboxSession = Experimental_SandboxSession & {
  /**
   * sandboxを停止し、後片付けを行う。
   *
   * @remarks
   * 実行中か停止済みかを問わず呼べる必要がある。同じsandboxに対する複数回の呼び出しを
   * 許容するかは実装に依存する。
   */
  readonly destroy: () => PromiseLike<void>;
};

/**
 * HarnessAgentのセッションのうち、アダプタが利用する操作。
 *
 * `@ai-sdk/harness`の`HarnessAgentSession`がそのまま適合する。
 */
export interface HarnessSessionLike {
  /** 承認待ちなどで、現在のターンが次の入力を待っているかを返す。 */
  hasUnfinishedTurn(): boolean;

  /** 実行中のターンを終了し、セッションを破棄する。 */
  destroy(): PromiseLike<void>;
}

/**
 * HarnessAgentのうち、アダプタが利用する操作。
 *
 * `@ai-sdk/harness`の`HarnessAgent`がそのまま適合する。テストなどで差し替えられるよう、
 * 必要な操作だけを公開する。
 *
 * @typeParam TSession - `createSession`が返すセッションの型。
 */
export interface HarnessAgentLike<TSession extends HarnessSessionLike = HarnessSessionLike> {
  /**
   * Harnessのセッションを生成する。
   *
   * @param options - 実行に使用するsandbox session。所有権は呼び出し元に残る。
   */
  createSession(options: { readonly sandboxSession: HarnessSandboxSession }): PromiseLike<TSession>;

  /**
   * セッションに1ターン分の入力を送り、出力をストリームで返す。
   *
   * @param options - 対象セッション、入力、中断用シグナル。
   * @returns `stream`プロパティにイベント列を持つオブジェクト。
   * @remarks
   * `stream`の各要素は`type`を持つオブジェクトとして扱い、`text-delta`、`finish`、
   * `error`、`abort`以外は無視する。
   */
  stream(options: {
    readonly session: TSession;
    readonly prompt: string;
    readonly abortSignal?: AbortSignal;
  }): PromiseLike<{ readonly stream: AsyncIterable<unknown> }>;
}

/**
 * {@link createHarnessAgent}の設定。
 *
 * @typeParam TSession - `harnessAgent`が返すセッションの型。
 * @remarks
 * 会話履歴は`harnessAgent`側が保持する。アダプタは履歴を複製しない。
 */
export interface HarnessAgentOptions<TSession extends HarnessSessionLike = HarnessSessionLike> {
  /** 実行に使用するHarnessAgent。 */
  readonly harnessAgent: HarnessAgentLike<TSession>;

  /**
   * セッションごとにsandboxを生成する。
   *
   * @returns 生成されたsandbox session。所有権はアダプタが引き取り、
   * 対応する{@link AgentSession.close}で`destroy`される。
   * @remarks
   * `@ai-sdk/harness`の`HarnessAgent.getSandboxTemplate`を使う場合は、
   * このコールバックの中で`sandboxConfig`とあわせて解決する。
   */
  readonly createSandboxSession: () => HarnessSandboxSession | PromiseLike<HarnessSandboxSession>;
}
