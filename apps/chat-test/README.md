# chat-test

選んだバックエンドのチャットを手元で試すための簡易アプリ。Electrobun 2系で作る。

`provider-management`が列挙するバックエンド（内蔵のエージェントで動かすプロバイダとACP互換のハーネス）から1つ選び、
モデルとAPIキーを指定してチャット用セッションを開き、1ターンずつ送信できる。
バックエンドの組み立ては`uniform-interface`の`createChatAgent`に任せるため、このアプリは
選んだIDと受け取ったイベントを受け渡すだけになっている。

## 構成

| ファイル               | 役割                                                              |
| ---------------------- | ----------------------------------------------------------------- |
| `src/bun/index.ts`     | メインプロセス。セッションを作り、イベントを画面へ流す            |
| `src/mainview/`        | 画面。バックエンドとモデルを選び、イベントを表示する              |
| `src/shared/rpc.ts`    | メインプロセスと画面で共有するRPCの型                             |
| `electrobun.config.ts` | Electrobunのビルド設定（`build.mainProcess: "bun"`、views、copy） |
| `hutch.config.ts`      | Hutchのタスクとパッケージマネージャ（pnpm）の指定                 |

## 動かす

リポジトリのルートで、依存とパッケージのビルドを済ませてから起動する。
アプリはワークスペースのパッケージを`dist`経由で読むため、パッケージ側の変更後は
`vp run -r build`をやり直す。

```bash
vp install
vp run -r build
vp -C apps/chat-test run typecheck   # .hutch/devkit を生成して型検査
vp -C apps/chat-test run start       # hutch electrobun dev --watch
```

初回の`start`はHutch（ビルドツール）とElectrobunのランタイムを`~/.hutch`へ、
SDKを`apps/chat-test/.hutch/devkit`へダウンロードする。どちらもコミットしない。

## バックエンドの選び方

- **プロバイダ**: モデルIDとAPIキーを指定してチャット用のPIで動かす。APIキーは画面で入力するか、
  次の環境変数から読む。画面で入力したキーが優先される。
  `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY` / `XAI_API_KEY` /
  `MISTRAL_API_KEY` / `GROQ_API_KEY` / `DEEPSEEK_API_KEY` / `CEREBRAS_API_KEY` /
  `TOGETHER_API_KEY` / `FIREWORKS_API_KEY` / `MOONSHOT_API_KEY`
- **ハーネス**: acpx経由でACP互換のエージェントを動かす。エージェント本体のインストールと認証は
  利用者が済ませておく。モデルはエージェントが受け付けるID（一覧は
  `provider-management`の`listModels`が同じ手順で引く）。

どちらもチャット用なので、ファイルの読み書きとツールは使わない（ハーネスは使い捨ての作業
ディレクトリで`deny-all`として動かす）。

## 既知の注意

- **ハーネスはエージェント本体の認証が要る**。未認証だとモデル一覧の取得が失敗し、画面に
  「モデル一覧の取得に失敗しました: Authentication required」のように出る。たとえば`codex`を
  使うなら、先に`codex login`を済ませておく（`codex login status`が`Not logged in`なら未認証）。
- **`opencode`ハーネスはacpxがnpm版を起動する**。acpxは`opencode`を
  `npx -y opencode-ai acp`（npmの`opencode-ai`＝OpenCode V1系）で起動し、ローカルに入っている
  `opencode`（V2系）は使わない。V1は`~/.config/opencode/opencode.jsonc`のV2専用キー
  （トップレベルの`permissions`と`agents.*.permissions`）を解釈できず、ACPの`initialize`前に
  終了するため、次のように失敗する。

  ```
  ACP agent exited before initialize completed (exit=1, signal=null):
  Error: Configuration is invalid at /Users/<user>/.config/opencode/opencode.jsonc
  ↳ V2 permissions are not supported by OpenCode V1. ...
  ```

  この場合は別のハーネスを使うか、V1が読める設定ディレクトリへ`XDG_CONFIG_HOME`を向けて起動する。
  設定をV1/V2の両方で読める形にするのが恒久対応。

  ```bash
  mkdir -p /tmp/oc-acp
  XDG_CONFIG_HOME=/tmp/oc-acp vp -C apps/chat-test run start
  ```

## メモ

- メインプロセスのランタイムはBun。バックエンドはacpxやPI Coding Agentなど動的読み込みや
  サブプロセス起動を含む依存を抱えるため、Node互換を狙うCottontailより確実な選択にしている。
- `electrobun.config.ts`の`build.bun.external`で`provider-management`と`uniform-interface`を
  バンドル対象から外し、ワークスペースの`node_modules`から実行時に読む。そのためこのアプリは
  リポジトリ内（ワークスペースがある状態）で動かす前提で、配布は考えていない。
- 型検査はElectrobunが生成する`.hutch/devkit`に依存するため、ルートの`vp check`からは
  `apps/**`を除いている。アプリ単体の検査は`vp -C apps/chat-test run typecheck`を使う。
