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
- `packages/provider-management` — 利用できるプロバイダやハーネス、そのモデルを管理するパッケージ
- `packages/uniform-interface` — バックエンドを列挙して選択式で使えるようにするパッケージ

ツールチェーンはVite+ (`vp`) に統一する。lint/fmt/type checkの設定はルートの `vite.config.ts` に集約し、パッケージ側の `vite.config.ts` にはビルド設定だけを置く。

## 構成

- **`packages/backend-adapter`**
  - Vercel AI SDKをラップして設定が必要な項目だけ抽出
  - 以下のバックエンドに対応
    - APIキー直接
    - acpxを使ったACPエージェントの操作
- **`packages/provider-management`**（プロバイダ、認証管理）
  - 利用可能なプロバイダ、ハーネス一覧、認証をまとめて管理する
  - 選んだモデル、経路、設定を一つのインターフェースにまとめて統一インターフェースに渡せる
- **`packages/uniform-interface`**（バックエンドを統一して扱うためのインターフェース）
  - 様々なプロバイダやハーネスを事前に列挙し、利用者は選択式でエージェントを利用できる
  - バックエンド方式を抽象化し、ユーザーは以下の軸で方式を選択できる
    - **チャット**
      - tool useなし、ファイル読み書きなしのチャット用セッションが動作する
      - ACP backendの場合、toolなし、仮ディレクトリで動作させてチャットっぽくする
    - **エージェント**
      - tool useあり、作業ディレクトリ指定ファイル読み書きありのエージェント向けセッションが動作する
      - API backendでは内蔵PI Coding Agentを利用してハーネスを動作させる
- **認証とチャットのサンプルUI**
  - 作成予定

## ADR

- HarnessAgentはローカル環境でのClaude Code/Codexなどの利用に向かない設計だったため不採用
  - Vercel Sandbox上での実行を前提としており、利用者自身のマシンで動くローカルエージェントに合わない
  - 代わりにacpxのin-processランタイム（`acpx/runtime`）を採用する
  - acpxはACP互換のエージェントをCLI・ランタイムの両方から扱え、認証はエージェント本体に委ねられる
- 内蔵ハーネスにはPI Coding Agentを採用。軽量でインストール不要でTSから直接使える数少ない選択肢で著名なため
  - PI Coding Agent非対応プロバイダは工数削減&マイナーなため除外で暫定対処

## 運用方針

- v0台は破壊的変更を許容
