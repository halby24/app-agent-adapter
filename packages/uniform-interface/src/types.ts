import type { AcpxPermissionMode } from "backend-adapter";
import type { LanguageModel } from "ai";

/**
 * 選択肢の種類。
 *
 * - `provider`: AI SDKのプロバイダが提供する言語モデルを直接呼び出す。
 * - `harness`: ACP互換のコーディングエージェントをacpx経由で動かす。
 */
export type AgentOptionKind = "provider" | "harness";

/** 言語モデルを直接呼び出すプロバイダの選択肢。 */
export interface ProviderOption {
  readonly kind: "provider";

  /** 一覧内で一意なID。AI SDKのプロバイダ名と一致する。 */
  readonly id: string;

  /** 一覧に表示する名前。 */
  readonly label: string;

  /** 選択に必要なAI SDKのプロバイダパッケージ。 */
  readonly package: string;
}

/** ACP互換のコーディングエージェント（ハーネス）の選択肢。 */
export interface HarnessOption {
  readonly kind: "harness";

  /** 一覧内で一意なID。acpxの組み込みエージェント名と一致する。 */
  readonly id: string;

  /**
   * 一覧に表示する名前。
   *
   * 表示用の別名を定義していないため、IDと同じacpxの組み込み名を使う。
   */
  readonly label: string;
}

/**
 * 利用者が選択できるエージェントのバックエンド。
 *
 * {@link listAgentOptions}が返す一覧の要素であり、選択時は
 * {@link AgentSelection}として{@link createAgent}に渡す。
 */
export type AgentOption = ProviderOption | HarnessOption;

/** プロバイダを選択したときの指定。 */
export interface ProviderSelection {
  readonly kind: "provider";

  /** 選択した{@link ProviderOption}のID。 */
  readonly id: string;

  /**
   * ターンの生成に使用する言語モデル。
   *
   * APIキーなどの認証はアプリ側の責務であり、認証済みのモデルをここに渡す。
   */
  readonly model: LanguageModel;

  /**
   * すべてのセッションに適用するシステム指示。
   *
   * @defaultValue 省略時はシステム指示を送信しない。
   */
  readonly instructions?: string;
}

/** ハーネスを選択したときの指定。 */
export interface HarnessSelection {
  readonly kind: "harness";

  /** 選択した{@link HarnessOption}のID。 */
  readonly id: string;

  /** セッションの作業ディレクトリ。エージェントはこのディレクトリを基準にファイルを扱う。 */
  readonly cwd: string;

  /**
   * すべてのセッションに適用するシステム指示。
   *
   * @defaultValue 省略時はシステム指示を送信しない。
   */
  readonly instructions?: string;

  /**
   * エージェントが要求した操作の扱い。
   *
   * @defaultValue 省略時は`"deny-all"`（{@link createAgent}が補う）。
   */
  readonly permissionMode?: AcpxPermissionMode;
}

/**
 * 一覧から選んだバックエンドの指定。
 *
 * `kind`が{@link AgentOption}の種類と一致していなければならない。
 */
export type AgentSelection = ProviderSelection | HarnessSelection;
