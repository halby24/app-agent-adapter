# app-agent-adapter

ローカルアプリ（Electron、Electrobunなど）から、利用者自身のモデル契約やAPIキーでAIエージェントを動かすためのアダプタ。

[Vercel AI SDK](https://ai-sdk.dev/) の言語モデル抽象を土台に、アプリが扱いやすい小さなエージェントAPIを提供する。

## できること

- 1つのセッション内で複数ターンの会話を続ける（履歴はメモリ上に保持）
- モデルのテキスト出力をイベントとして逐次受け取る
- 利用者が用意したAI SDKのモデルをそのまま渡す
- セッション単位・ターン単位の中断

現時点ではツール利用と履歴の永続化には対応していない。

## インストール

```bash
pnpm add app-agent-adapter @ai-sdk/openai
```

`ai` (Vercel AI SDK) は依存として自動的にインストールされる。モデルに応じて任意のAI SDKプロバイダを追加する。

## 使い方

```ts
import { openai } from "@ai-sdk/openai";
import { createAgent } from "app-agent-adapter";

const agent = createAgent({
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

### セッション固有の指示

```ts
const session = await agent.createSession({
  instructions: "あなたはコードレビュアーです。",
});
```

省略した場合は `createAgent()` に渡した `instructions` を継承する。

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

| API                             | 説明                                       |
| ------------------------------- | ------------------------------------------ |
| `createAgent(options)`          | エージェントを生成する                     |
| `agent.createSession(options?)` | 独立した会話履歴を持つセッションを生成する |
| `session.send(input, options?)` | 1ターンを送信し、`AgentEvent` を逐次返す   |
| `session.close()`               | セッションを閉じ、進行中のターンを中断する |

`send()` は `AsyncIterable<AgentEvent>` を返す。リクエストは反復を開始した時点で送信される。

### イベント

```ts
type AgentEvent =
  | { type: "text-delta"; text: string }
  | {
      type: "finish";
      finishReason: FinishReason;
      usage: LanguageModelUsage;
      text: string;
    };
```

正常なターンでは `text-delta` が0個以上続いたあと、`finish` が1個届く。

### エラー

セッションの状態に起因する失敗は `AgentError` で通知される。

| `code`           | 条件                                     |
| ---------------- | ---------------------------------------- |
| `session-closed` | 閉じたセッションに送信した               |
| `session-busy`   | 前のターンが進行中に次のターンを送信した |

モデルやプロバイダに起因する失敗は包まず、そのまま伝播する。

## 現在の制約

- ツール呼び出しには対応していない
- 会話履歴はセッションのメモリ上にのみ存在し、永続化・復元はできない
- セッションをまたいだ履歴の共有はできない

HarnessAgent（ACP）やサブスクリプション認証への対応は、同じ公開APIの裏側に追加していく予定。

## 開発

```bash
vp install
vp test
vp check
vp pack
```

## ライセンス

MIT
