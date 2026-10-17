/**
 * メインプロセスと画面の間でやり取りするRPCの形。
 *
 * 画面側は{@link Electroview}、メインプロセス側は`BrowserView.defineRPC`に同じ型を渡す。
 * 型だけを定義するモジュールなので、どちらの実行環境からも読み込める。
 *
 * バックエンドの選択とモデルの一覧はメインプロセスが引き、画面は受け取った
 * 文字列をそのまま送り返すだけにする。そのためIDはここでは`string`として扱う。
 */
import type { AgentEvent } from "uniform-interface";
import type { RPCSchema } from "electrobun/view";

export type { AgentEvent } from "uniform-interface";

/** チャットで選べるバックエンドの種類。 */
export type BackendKind = "provider" | "harness";

/** 画面に出すバックエンドの選択肢。 */
export interface BackendOption {
  readonly kind: BackendKind;
  readonly id: string;
  readonly label: string;
}

/** 画面に出すモデルの選択肢。 */
export interface ModelOption {
  readonly id: string;
  readonly name?: string;
}

/**
 * セッションの開始に必要な指定。
 *
 * チャット用セッションなので作業ディレクトリと権限は指定しない。
 */
export interface SessionConfig {
  readonly kind: BackendKind;
  readonly id: string;

  /**
   * 使うモデル。
   *
   * プロバイダでは必須。ハーネスでは省略可で、省略時はエージェントの既定になる。
   */
  readonly model?: string;

  /**
   * プロバイダのAPIキー。
   *
   * @defaultValue 省略時はメインプロセスが環境変数から読む。
   */
  readonly apiKey?: string;

  /** すべてのセッションに適用するシステム指示。 */
  readonly instructions?: string;
}

/** 処理の成否。失敗時は表示用の理由を持つ。 */
export type Result = { readonly ok: true } | { readonly ok: false; readonly error: string };

/** 画面とメインプロセスのRPCスキーマ。 */
export type ChatTestRPC = {
  bun: RPCSchema<{
    requests: {
      /** 選べるバックエンドを列挙する。 */
      listBackends: { params: {}; response: readonly BackendOption[] };

      /** 選んだバックエンドが使えるモデルを列挙する。 */
      listModels: {
        params: { readonly kind: BackendKind; readonly id: string };
        response: readonly ModelOption[];
      };

      /** セッションを開始する。進行中のセッションがあれば閉じる。 */
      openSession: { params: SessionConfig; response: Result };

      /** 1ターン送信する。イベントは`agentEvent`として届く。 */
      send: { params: { readonly text: string }; response: Result };

      /** 進行中のターンを中断する。 */
      cancel: { params: {}; response: Result };

      /** セッションを閉じる。 */
      closeSession: { params: {}; response: Result };
    };
    messages: {};
  }>;
  webview: RPCSchema<{
    requests: {};
    messages: {
      /** セッションが返したイベント。 */
      agentEvent: { readonly event: AgentEvent };

      /** 画面に出す補足（開始、中断、エラーなど）。 */
      status: { readonly message: string };
    };
  }>;
};
