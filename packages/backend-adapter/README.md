# backend-adapter

ローカルアプリ（Electron、Electrobunなど）から、利用者自身のモデル契約やAPIキーでAIエージェントを動かすためのアダプタ。

[Vercel AI SDK](https://ai-sdk.dev/) を土台に、アプリが扱いやすい小さなエージェントAPIを提供する。次の2種類のエージェントを同じ公開APIで扱える。

- 言語モデルを直接呼び出すエージェント
- ACP互換のコーディングエージェントを [acpx](https://github.com/openclaw/acpx) 経由で動かすエージェント

## できること

- 1つのセッション内で複数ターンの会話を続ける（履歴はメモリ上に保持）
- モデルのテキスト出力をイベントとして逐次受け取る
- 利用者が用意したAI SDKのモデル、またはacpxが対応するコーディングエージェントを渡す
- セッション単位・ターン単位の中断

現時点では履歴の永続化には対応していない。

## インストール

言語モデルを直接呼び出す場合:

```bash
pnpm add backend-adapter @ai-sdk/openai
```

`ai` (Vercel AI SDK) は依存として自動的にインストールされる。モデルに応じて任意のAI SDKプロバイダを追加する。

コーディングエージェントを動かす場合も追加のインストールは不要（`acpx` が依存として入る）。利用するエージェント本体（Claude Code、Codexなど）のインストールと認証は利用者が済ませておく。

## 使い方

### 言語モデルを直接呼び出す

```ts
import { openai } from "@ai-sdk/openai";
import { createModelAgent } from "backend-adapter";

const agent = createModelAgent({
  model: openai("gpt-5.4-mini"),
  instructions: "あなたは簡潔に答えるアシスタントです。",
});

const session = await agent.createSession();

try {
  for await (const event of session.send("こんにちは")) {
    if (event.type === "text-delta") {
      process.stdout.write(event.text);
    }
    if (event.type === "finish") {
      console.log("\n終了理由:", event.finishReason);
    }
  }

  // 同じセッションなので、前のターンが文脈に含まれる
  for await (const event of session.send("もう少し詳しく")) {
    if (event.type === "text-delta") {
      process.stdout.write(event.text);
    }
  }
} finally {
  await session.close();
}
```

セッション固有の指示を渡すこともできる。省略した場合は `createModelAgent()` の `instructions` を継承する。

```ts
const session = await agent.createSession({
  instructions: "あなたはコードレビュアーです。",
});
```

### acpx経由でコーディングエージェントを動かす

アダプタは `acpx` のin-processランタイムをセッションごとに内部生成し、`session.close()` でACP接続とランタイムを破棄する。会話履歴はアダプタが持つインメモリのセッションストアにのみ存在し、`~/.acpx` などには書き込まれない。

```ts
import { createAcpxAgent } from "backend-adapter";

const agent = createAcpxAgent({
  agent: "claude",
  cwd: "/path/to/project",
  instructions: "あなたはリポジトリを調査して修正するエージェントです。",
  // 既定は "deny-all"。編集やコマンド実行を許す場合は明示する。
  permissionMode: "approve-all",
});

const session = await agent.createSession();

try {
  for await (const event of session.send("失敗しているテストを直して")) {
    if (event.type === "text-delta") {
      process.stdout.write(event.text);
    }
  }
} finally {
  await session.close();
}
```

`agent` にはacpxの組み込み名（`"claude"`、`"codex"`、`"pi"`、`"gemini"` など）か、ACPサーバを起動するコマンドを渡す。セッション固有の指示は `createSession({ instructions })` で上書きできる。

### 中断

```ts
const controller = new AbortController();

for await (const event of session.send("長い説明をして", {
  abortSignal: controller.signal,
})) {
  // ...
}

// 別の場所から
controller.abort();
```

セッションを閉じた場合も、進行中のターンは中断される。

## 公開API

| API                             | 説明                                                    |
| ------------------------------- | ------------------------------------------------------- |
| `createModelAgent(options)`     | 言語モデルを直接呼び出すエージェントを生成する          |
| `createAcpxAgent(options)`      | acpx経由でACPエージェントを動かすエージェントを生成する |
| `agent.createSession(options?)` | 独立した会話履歴を持つセッションを生成する              |
| `session.send(input, options?)` | 1ターンを送信し、`AgentEvent` を逐次返す                |
| `session.close()`               | セッションを閉じ、進行中のターンを中断する              |

`send()` は `AsyncIterable<AgentEvent>` を返す。リクエストは反復を開始した時点で送信される。acpxの場合、セッションの会話履歴はacpxのセッションが保持する。

### イベント

```ts
type AgentEvent =
  | { type: "text-delta"; text: string }
  | {
      type: "finish";
      finishReason: FinishReason;
      usage: AgentUsage;
      text: string;
    };

interface AgentUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}
```

正常なターンでは `text-delta` が0個以上続いたあと、`finish` が1個届く。エージェント内部のツール実行や思考過程は現時点では公開していない。

### エラー

セッションの状態に起因する失敗は `AgentError` で通知される。

| `code`           | 条件                                     |
| ---------------- | ---------------------------------------- |
| `session-closed` | 閉じたセッションに送信した               |
| `session-busy`   | 前のターンが進行中に次のターンを送信した |
| `turn-failed`    | エージェントがターンを失敗として終えた   |

モデルやエージェント、プロバイダに起因する失敗は、判別可能な場合は包まず、そのまま伝播する。`turn-failed` の `cause` にはエージェントが報告した詳細が入る。中断されたターンは `AbortError` として通知される。

## 現在の制約

- acpxの権限モードの既定は `deny-all`。書き込みやコマンド実行を許すには `permissionMode` を明示する
- ツール実行のイベントは公開していない。エージェント内部のツール呼び出しは `finish` に集約される
- 思考過程（acpxの `stream: "thought"` の差分）は公開しない
- 会話履歴はセッションのメモリ上にのみ存在し、永続化・復元はできない（acpxのセッションストアはアダプタがインメモリで持つ）
- セッションをまたいだ履歴の共有はできない
- セッションごとにacpxのランタイムとエージェントプロセスを生成する

認証はエージェント本体（Claude Code、Codexなど）が担う。アダプタはacpx経由でそれをそのまま利用する。

## 開発

リポジトリのルートで実行する。

```bash
vp install
vp check
vp run -r test
vp run -r build
```

このパッケージだけを対象にする場合は `vp -C packages/backend-adapter test` のように指定する。

## ライセンス

MIT
