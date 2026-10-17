# app-agent-adapter

ローカルアプリ（Electron、Electrobunなど）から、利用者自身のモデル契約やAPIキーでAIエージェントを動かすためのアダプタ。

[Vercel AI SDK](https://ai-sdk.dev/) を土台に、アプリが扱いやすい小さなエージェントAPIを提供する。次の2種類のエージェントを同じ公開APIで扱える。

- 言語モデルを直接呼び出すエージェント
- 既存のコーディングエージェントを `HarnessAgent` 経由で動かすエージェント

## できること

- 1つのセッション内で複数ターンの会話を続ける（履歴はメモリ上に保持）
- モデルのテキスト出力をイベントとして逐次受け取る
- 利用者が用意したAI SDKのモデル、またはHarnessAgentをそのまま渡す
- セッション単位・ターン単位の中断

現時点では履歴の永続化には対応していない。

## インストール

言語モデルを直接呼び出す場合:

```bash
pnpm add app-agent-adapter @ai-sdk/openai
```

`ai` (Vercel AI SDK) は依存として自動的にインストールされる。モデルに応じて任意のAI SDKプロバイダを追加する。

HarnessAgentを使う場合は、`@ai-sdk/harness` と、利用するハーネス／sandboxのアダプタを追加する。

```bash
pnpm add app-agent-adapter @ai-sdk/harness @ai-sdk/harness-pi @ai-sdk/sandbox-vercel
```

## 使い方

### 言語モデルを直接呼び出す

```ts
import { openai } from "@ai-sdk/openai";
import { createModelAgent } from "app-agent-adapter";

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

### HarnessAgent経由でコーディングエージェントを動かす

HarnessAgentはsandbox sessionが必須なので、セッションごとにsandboxを生成するコールバックを渡す。sandboxの所有権はアダプタが引き取り、`session.close()` でセッションとsandboxの両方を破棄する。

```ts
import { HarnessAgent } from "@ai-sdk/harness/agent";
import { pi } from "@ai-sdk/harness-pi";
import { createVercelNetworkSandboxSession } from "@ai-sdk/sandbox-vercel";
import { createHarnessAgent } from "app-agent-adapter";

const harnessAgent = new HarnessAgent({
  harness: pi,
  model: "anthropic/claude-sonnet-4.6",
  instructions: "あなたはリポジトリを調査して修正するエージェントです。",
});

const agent = createHarnessAgent({
  harnessAgent,
  // sandboxの生成方法はアプリが選ぶ。返したsandboxはclose()で破棄される。
  createSandboxSession: async () => {
    const template = await harnessAgent.getSandboxTemplate();

    return createVercelNetworkSandboxSession({
      runtime: "node24",
      ports: [4000],
      template,
    });
  },
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

HarnessAgentの指示やツール承認の設定は、`HarnessAgent` 側で行う。`createHarnessAgent()` はセッション固有の `instructions` を受け取らない（渡すと `AgentError` の `option-unsupported` になる）。

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

| API                             | 説明                                           |
| ------------------------------- | ---------------------------------------------- |
| `createModelAgent(options)`     | 言語モデルを直接呼び出すエージェントを生成する |
| `createHarnessAgent(options)`   | HarnessAgentをラップしたエージェントを生成する |
| `agent.createSession(options?)` | 独立した会話履歴を持つセッションを生成する     |
| `session.send(input, options?)` | 1ターンを送信し、`AgentEvent` を逐次返す       |
| `session.close()`               | セッションを閉じ、進行中のターンを中断する     |

`send()` は `AsyncIterable<AgentEvent>` を返す。リクエストは反復を開始した時点で送信される。HarnessAgentの場合、セッションの会話履歴はハーネス側が保持する。

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

正常なターンでは `text-delta` が0個以上続いたあと、`finish` が1個届く。HarnessAgentが流すツール実行などのイベントは現時点では公開していない。

### エラー

セッションの状態に起因する失敗は `AgentError` で通知される。

| `code`                | 条件                                                             |
| --------------------- | ---------------------------------------------------------------- |
| `session-closed`      | 閉じたセッションに送信した                                       |
| `session-busy`        | 前のターンが進行中に次のターンを送信した                         |
| `turn-unfinished`     | ツール承認待ちなど、アダプタが扱わない入力待ちでターンが終わった |
| `option-unsupported`  | 使用中のバックエンドが対応しない設定を渡した                     |
| `invalid-stream-part` | バックエンドの出力イベントが想定した形を満たしていない           |

モデルやハーネス、プロバイダに起因する失敗は包まず、そのまま伝播する。

## 現在の制約

- ツール実行のイベントは公開していない。HarnessAgentのツールが承認待ちになったターンは `turn-unfinished` エラーになる
- 会話履歴はセッションのメモリ上にのみ存在し、永続化・復元はできない
- セッションをまたいだ履歴の共有はできない
- HarnessAgentのセッション固有の指示には未対応

サブスクリプション認証への対応は、同じ公開APIの裏側に追加していく予定。

## 開発

```bash
vp install
vp test
vp check
vp pack
```

## ライセンス

MIT
