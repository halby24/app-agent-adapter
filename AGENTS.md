# App Agent Adapter

## 概要

ローカルアプリ向け (Electron, Electrobunなど) のAIエージェントを利用するためのアダプタ

## なぜ作るのか

Vercel AI SDKはやりたいことに近いが、クラウドサービス側で利用するのが前提の側面がある
「利用者自身のサブスクやAPIキーをアプリから呼んでAIエージェントとして使う」ための口としてのラッパーを作りたい
裏がAPIキーであっても他ハーネスであっても統一的に扱えるようにしたい

## リポジトリ構成

pnpm workspaceのモノレポ。パッケージは `packages/` 配下に置く。

- `packages/backend-adapter` — エージェントのバックエンドをアダプタして統一APIで扱うパッケージ
- `packages/uniform-interface` — バックエンドを列挙して選択式で使えるようにするパッケージ

ツールチェーンはVite+ (`vp`) に統一する。lint/fmt/type checkの設定はルートの `vite.config.ts` に集約し、パッケージ側の `vite.config.ts` にはビルド設定だけを置く。

## 構成

- **`packages/backend-adapter`**
  - Vercel AI SDKをラップして設定が必要な項目だけ抽出
  - 以下のバックエンドに対応
    - APIキー直接
    - acpxを使ったACPエージェントの操作
- **`packages/uniform-interface`**（バックエンドを統一して扱うためのインターフェース）
  - 様々なプロバイダやハーネスを事前に列挙し、利用者は選択式でエージェントを利用できる
  - 認証、バックエンド方式に関わらず同じインターフェースで利用できる
- **認証仲介**
  - 作成予定
- **認証とチャットのサンプルUI**
  - 作成予定

## ADR

- HarnessAgentはローカル環境でのClaude Code/Codexなどの利用に向かない設計だったため不採用
  - Vercel Sandbox上での実行を前提としており、利用者自身のマシンで動くローカルエージェントに合わない
  - 代わりにacpxのin-processランタイム（`acpx/runtime`）を採用する
  - acpxはACP互換のエージェントをCLI・ランタイムの両方から扱え、認証はエージェント本体に委ねられる

## 予定

まずはミニマル公開APIで契約の口を固めたい
初期のエージェント機能はtool useなし、セッション履歴は使い捨て保持なしでOK
ただし1セッション内の複数ターン会話は必要
