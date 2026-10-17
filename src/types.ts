import type { HarnessAgent } from "@ai-sdk/harness/agent";
import type { FinishReason, LanguageModel } from "ai";

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
 * {@link createHarnessAgent}の設定。
 *
 * @remarks
 * 会話履歴は`harnessAgent`側が保持する。アダプタは履歴を複製しない。
 * sandboxはアダプタが`@ai-sdk/sandbox-just-bash`で既定設定により生成し、
 * セッション終了時に破棄する。
 */
export interface HarnessAgentOptions {
  /** 実行に使用するHarnessAgent。 */
  readonly harnessAgent: HarnessAgent;
}
