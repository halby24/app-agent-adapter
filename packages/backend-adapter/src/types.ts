/**
 * モデルが生成を終了した理由。
 *
 * PIとacpxの停止理由を共通の語彙に読み替えたもの。`"stop"`は通常の終了、
 * `"length"`は上限による停止、`"content-filter"`は内容制限、
 * `"tool-calls"`はツールの利用、`"error"`は失敗、`"other"`はそれ以外。
 */
export type FinishReason = "stop" | "length" | "content-filter" | "tool-calls" | "error" | "other";

/**
 * エージェントが要求した操作（ファイル編集、コマンド実行など）をどう扱うか。
 *
 * acpxの権限モードと同じ値。
 *
 * - `approve-all`: すべての要求を自動承認する。
 * - `approve-reads`: 読み取りは自動承認し、それ以外は承認しない。
 * - `deny-all`: すべての要求を拒否する。エージェントは読み取り以外の操作ができない。
 */
export type AcpxPermissionMode = "approve-all" | "approve-reads" | "deny-all";

/**
 * セッション生成時に適用する設定。
 */
export interface SessionOptions {
  /**
   * このセッションだけに適用するシステム指示。
   *
   * @defaultValue 省略時はエージェント生成時の指示を継承する。
   */
  readonly instructions?: string;
}

/**
 * acpx経由のエージェントのセッション生成設定。
 */
export interface AcpxSessionOptions extends SessionOptions {
  /**
   * このセッションだけに適用するモデル。
   *
   * @defaultValue 省略時はエージェント生成時の{@link AcpxAgentOptions.model}を継承する。
   * @remarks
   * 対応しないモデルを指定した場合は、acpxが返す`ACP_MODEL_UNSUPPORTED`の失敗がそのまま伝播する。
   */
  readonly model?: string;
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

/** モデルが生成した思考（reasoning）の断片。 */
export interface ReasoningDeltaEvent {
  readonly type: "reasoning-delta";

  /**
   * 直前の断片に続けて表示する思考のテキスト。
   *
   * @remarks
   * 思考を表示するかどうかは利用側が決める。表示しない場合はこのイベントを無視する。
   */
  readonly text: string;
}

/**
 * ツールが何をするかの分類。
 *
 * バックエンドごとにツール名や種類の語彙が異なるため、表示や絞り込みに使う共通の語彙。
 */
export type ToolKind = "read" | "search" | "edit" | "execute" | "other";

/** ツールの実行が始まったことを表すイベント。 */
export interface ToolCallEvent {
  readonly type: "tool-call";

  /**
   * 同じツール呼び出しのイベントを関連付けるID。
   *
   * @remarks
   * バックエンドがIDを報告しない場合は、アダプタが生成する。
   */
  readonly toolCallId: string;

  /** エージェントが報告したツール名。報告しない場合は省略される。 */
  readonly toolName?: string;

  /** 表示用の説明（`Read src/index.ts`など）。報告しない場合は省略される。 */
  readonly title?: string;

  /** 何をするツールかの分類。報告しない場合は省略される。 */
  readonly kind?: ToolKind;
}

/** 実行中のツールが途中経過を報告したことを表すイベント。 */
export interface ToolCallUpdateEvent {
  readonly type: "tool-call-update";

  readonly toolCallId: string;

  /** 途中経過の内容を整形したテキスト。 */
  readonly text: string;
}

/** ツールの実行が終わったことを表すイベント。 */
export interface ToolResultEvent {
  readonly type: "tool-result";

  readonly toolCallId: string;

  /** ツールが失敗として終わったかどうか。 */
  readonly isError: boolean;

  /** 実行にかかった時間（ミリ秒）。報告しない場合は省略される。 */
  readonly durationMs?: number;

  /**
   * 結果を整形したテキスト。
   *
   * @remarks
   * 結果からテキストを取り出せない場合や、結果が空の場合は省略される。
   * 生のペイロードは公開しないため、長い内容は切り詰められる。
   */
  readonly text?: string;
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
 * `text-delta`をはじめとする差分イベントが0個以上続いたあと、正常終了時は`finish`が1個届く。
 * ツールの実行中は`tool-call`、`tool-call-update`、`tool-result`が届く。思考の`reasoning-delta`は
 * 常に届くため、表示するかどうかは利用側が決める。
 *
 * @remarks
 * イベントの種類は将来増える可能性がある。未知の`type`は無視して扱うこと。
 */
export type AgentEvent =
  | TextDeltaEvent
  | ReasoningDeltaEvent
  | ToolCallEvent
  | ToolCallUpdateEvent
  | ToolResultEvent
  | FinishEvent;

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
 * {@link createAcpxAgent}の設定。
 *
 * @remarks
 * 会話履歴はセッションのメモリ上にのみ存在し、永続化されない。
 * acpxの組み込みエージェント名（`"claude"`、`"codex"`、`"pi"`など）か、
 * ACPサーバを起動するコマンドを`agent`に渡す。エージェント本体の
 * インストールと認証は利用者が済ませておく必要がある。
 */
export interface AcpxAgentOptions {
  /**
   * 起動するACPエージェント。
   *
   * acpxの組み込み名、またはACPサーバを起動するコマンド。
   */
  readonly agent: string;

  /**
   * セッションの作業ディレクトリ。
   *
   * エージェントはこのディレクトリを基準にファイルを扱う。
   */
  readonly cwd: string;

  /**
   * すべてのセッションに適用するシステム指示。
   *
   * @defaultValue 省略時はシステム指示を送信しない。
   */
  readonly instructions?: string;

  /**
   * すべてのセッションに適用するモデル。
   *
   * エージェントが受け付けるモデルID（`"gpt-5.4"`など）を指定する。
   *
   * @defaultValue 省略時はエージェントが選ぶ既定のモデル。
   * @remarks
   * 対応しないモデルを指定した場合は、acpxが返す`ACP_MODEL_UNSUPPORTED`の失敗がそのまま伝播する。
   */
  readonly model?: string;

  /**
   * エージェントが要求した操作の扱い。
   *
   * @defaultValue `"deny-all"`
   * @remarks
   * 既定ではすべての操作要求を拒否する。書き込みやコマンド実行を許す場合は
   * `"approve-all"`などを明示する。
   */
  readonly permissionMode?: AcpxPermissionMode;
}

/**
 * acpx経由でACPエージェントを動かすエージェント。
 *
 * {@link Agent}と同じ扱いに加えて、セッションごとにモデルを指定できる。
 */
export interface AcpxAgent extends Agent {
  /**
   * {@inheritDoc Agent.createSession}
   *
   * @param options - セッション固有の設定。`model`を指定すると、そのセッションだけ
   * エージェントの既定と異なるモデルを使う。
   */
  createSession(options?: AcpxSessionOptions): Promise<AgentSession>;
}

/**
 * {@link createPiAgent}の設定。
 *
 * @remarks
 * 内蔵のPI Coding Agentをプロセス内で動かす。エージェント本体のインストールは不要。
 * モデルとその認証は、{@link PiAgentOptions.model}で指定しない限りPI側の設定（`~/.pi/agent`）に従う。
 */
export interface PiAgentOptions {
  /** セッションの作業ディレクトリ。エージェントはこのディレクトリを基準にファイルを扱う。 */
  readonly cwd: string;

  /**
   * 使うモデルとその認証。
   *
   * @defaultValue 省略時はPIの設定に従う。
   */
  readonly model?: PiModelSelection;

  /**
   * すべてのセッションに適用するシステム指示。
   *
   * @defaultValue 省略時はPIの既定のプロンプトを使う。
   * @remarks
   * acpxと同じく、PIの既定のプロンプトを置き換える（PIが足すスキルやコンテキストの節はそのまま）。
   */
  readonly instructions?: string;

  /**
   * エージェントが要求した操作の扱い。
   *
   * @defaultValue `"deny-all"`
   * @remarks
   * acpxの権限モードと同じ語彙を使う。`"deny-all"`と`"approve-reads"`では
   * 読み取り以外のツール（書き込み、コマンド実行）を渡さないため、結果は同じになる。
   */
  readonly permissionMode?: AcpxPermissionMode;
}

/**
 * チャット用に固定したPIエージェント（`{@link createPiChatAgent}`）の設定。
 *
 * @remarks
 * コーディング用とは異なり、ツールを使わず、PIの既定プロンプトや技能などの資源も
 * 読み込まない。受け付ける指定は作業場所・モデル・指示だけに絞り、隔離の細目は
 * 内部で固定する。利用者の`~/.pi/agent`は読まない。
 */
export interface PiChatAgentOptions {
  /** セッションの作業ディレクトリ。エージェントはこのディレクトリを基準にファイルを扱う。 */
  readonly cwd: string;

  /**
   * 使うモデルとその認証。
   *
   * @defaultValue 省略時は一時設定の中でのPIの既定（利用者の `~/.pi/agent` は読まない）。
   */
  readonly model?: PiModelSelection;

  /**
   * すべてのセッションに適用するシステム指示。
   *
   * @defaultValue 省略時や空文字の場合は短い中立のチャット指示を使う。
   * @remarks
   * コーディング用と異なり、PIの既定プロンプトは使わない。空でない指示を指定した
   * 場合は、その指示に置き換える。
   */
  readonly instructions?: string;
}

/**
 * PIで使うモデルと、その認証。
 */
export interface PiModelSelection {
  /**
   * プロバイダのID。
   *
   * PIが扱うプロバイダ名（`"anthropic"`、`"together"`など）を指定する。
   */
  readonly provider: string;

  /** プロバイダのモデルID。{@link listPiModels}で調べられる。 */
  readonly id: string;

  /**
   * プロバイダのAPIキー。
   *
   * @remarks
   * 実行時の上書きとして渡し、PIの設定ファイルには保存しない。PIが扱わない
   * プロバイダやモデルを指定した場合は、セッションの生成に失敗する。
   */
  readonly apiKey: string;
}

/**
 * PIが扱うモデル。
 */
export interface PiModel {
  /** モデルを選ぶときに指定するID。 */
  readonly id: string;

  /** PIが定義する表示名。 */
  readonly name: string;
}

/**
 * {@link listPiModels}の設定。
 */
export interface PiModelsOptions {
  /**
   * モデルを列挙するプロバイダのID。
   *
   * @defaultValue 省略時はPIが扱うすべてのプロバイダのモデルを返す。
   */
  readonly provider?: string;
}
