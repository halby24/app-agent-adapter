# backend-adapter

ローカルアプリ（Electron、Electrobunなど）から、利用者自身のモデル契約やAPIキーでAIエージェントを動かすためのアダプタ。

[Vercel AI SDK](https://ai-sdk.dev/) を土台に、アプリが扱いやすい小さなエージェントAPIを提供する。次の3種類のエージェントを同じ公開APIで扱える。

- 言語モデルを直接呼び出すエージェント
- ACP互換のコーディングエージェントを [acpx](https://github.com/openclaw/acpx) 経由で動かすエージェント
- 内蔵の [PI Coding Agent](https://pi.dev/docs/latest/sdk) をプロセス内で動かすエージェント

## できること

- 1つのセッション内で複数ターンの会話を続ける（履歴はメモリ上に保持）
- モデルのテキスト出力をイベントとして逐次受け取る
- ツールの実行（開始・途中経過・結果）をイベントとして逐次受け取る
- 思考（reasoning）の差分もイベントとして受け取る（表示するかは利用側が決める）
- 利用者が用意したAI SDKのモデル、acpxが対応するコーディングエージェント、または内蔵のPI Coding Agentを渡す
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
  // 省略するとエージェントが選ぶ既定のモデルになる。
  model: "gpt-5.4",
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

モデルの指定は、エージェント生成時の `model` が全セッションの既定になる。`createSession({ model })` を使うと、そのセッションだけ別のモデルにできる。対応しないモデルを指定した場合は、acpxが返す `ACP_MODEL_UNSUPPORTED` の失敗がそのまま伝播する。

### 利用できるモデルを調べる

利用できるモデルの一覧は [provider-management](../provider-management) の `listAcpxModels()` が扱う。エージェントのプロセスを1つ起動して調べるため、セッションと同じ `cwd` を渡す。

### 内蔵のPI Coding Agentを動かす

[PI Coding Agent](https://pi.dev/docs/latest/sdk)（`@earendil-works/pi-coding-agent`）をプロセス内で動かす。エージェント本体のインストールは不要で、モデルとその認証はPI側の設定（`~/.pi/agent`など）に従う。

```ts
import { createPiAgent } from "backend-adapter";

const agent = createPiAgent({
  cwd: "/path/to/project",
  instructions: "あなたはリポジトリを調査して修正するエージェントです。",
  // 既定は "deny-all"。書き込みやコマンド実行を許す場合は明示する。
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

セッション固有の指示は `createSession({ instructions })` で上書きできる。会話履歴はセッションのメモリ上にのみ存在し、PIのセッションとしてもディスクに残さない。

モデルとその認証は、指定しない限りPI側の設定（`~/.pi/agent`）に従う。アプリが用意したAPIキーで動かす場合は、モデルとキーを渡す。

```ts
const agent = createPiAgent({
  cwd: "/path/to/project",
  model: { provider: "anthropic", id: "claude-haiku-4-5", apiKey: apiKey },
});
```

`provider`にはPIが扱うプロバイダ名を渡す。APIキーは実行時の上書きとして渡すため、PIの設定ファイル（`auth.json`）には保存しない。PIが扱わないプロバイダやモデルを指定した場合は、セッションの生成に失敗する。使えるモデルは`listPiModels()`で調べられる（PIに同梱された定義を読むだけで、問い合わせも認証も不要）。

操作の範囲（`permissionMode`）はacpxと同じ語彙で指定する。PIでは実行時に許可を求めるのではなく、渡したツールだけが使える。

| `permissionMode` | 使えるツール                             |
| ---------------- | ---------------------------------------- |
| `deny-all`       | 読み取り（`read`、`grep`、`find`、`ls`） |
| `approve-reads`  | 上と同じ                                 |
| `approve-all`    | 上に加えて`bash`、`edit`、`write`        |

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
| `createPiAgent(options)`        | 内蔵のPI Coding Agentを動かすエージェントを生成する     |
| `listPiModels(options?)`        | 内蔵のPI Coding Agentが扱うモデルの一覧を返す           |
| `agent.createSession(options?)` | 独立した会話履歴を持つセッションを生成する              |
| `session.send(input, options?)` | 1ターンを送信し、`AgentEvent` を逐次返す                |
| `session.close()`               | セッションを閉じ、進行中のターンを中断する              |

`send()` は `AsyncIterable<AgentEvent>` を返す。リクエストは反復を開始した時点で送信される。acpxとPIの場合、セッションの会話履歴はそれぞれのセッションが保持する。

### イベント

```ts
type AgentEvent =
  | { type: "text-delta"; text: string }
  | { type: "reasoning-delta"; text: string }
  | { type: "tool-call"; toolCallId: string; toolName?: string; title?: string; kind?: ToolKind }
  | { type: "tool-call-update"; toolCallId: string; text: string }
  | {
      type: "tool-result";
      toolCallId: string;
      isError: boolean;
      durationMs?: number;
      text?: string;
    }
  | {
      type: "finish";
      finishReason: FinishReason;
      usage: AgentUsage;
      text: string;
    };

type ToolKind = "read" | "search" | "edit" | "execute" | "other";

interface AgentUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}
```

正常なターンでは差分イベントが0個以上続いたあと、`finish` が1個届く。イベントの種類は将来増える可能性があるため、未知の `type` は無視して扱うこと。

- **ツール実行**: PIとacpxでは、ツールの実行が `tool-call`（開始）、`tool-call-update`（途中経過）、`tool-result`（終了）として届く。同じ呼び出しは `toolCallId` で関連付ける。`toolName` はバックエンドが報告した名前のまま、`kind` は共通の分類（`ToolKind`）で、対応が分からないものは `"other"` になる
- **思考**: 思考の差分は `reasoning-delta` として常に届く。表示するかどうかは利用側が決め、表示しない場合はこのイベントを無視する
- **整形**: `tool-result` の `text` などは表示用に整形したテキストで、生のペイロードは公開しない。長い内容は切り詰める

```ts
const agent = createPiAgent({
  cwd: "/path/to/project",
  permissionMode: "approve-all",
});

const session = await agent.createSession();

try {
  for await (const event of session.send("失敗しているテストを直して")) {
    switch (event.type) {
      case "text-delta":
        process.stdout.write(event.text);
        break;
      case "reasoning-delta":
        process.stderr.write(event.text);
        break;
      case "tool-call":
        console.log(`開始: ${event.title ?? event.toolName ?? event.toolCallId}`);
        break;
      case "tool-result":
        console.log(`終了: ${event.toolCallId}${event.isError ? "（失敗）" : ""}`);
        break;
    }
  }
} finally {
  await session.close();
}
```

### エラー

セッションの状態に起因する失敗は `AgentError` で通知される。

| `code`           | 条件                                     |
| ---------------- | ---------------------------------------- |
| `session-closed` | 閉じたセッションに送信した               |
| `session-busy`   | 前のターンが進行中に次のターンを送信した |
| `turn-failed`    | エージェントがターンを失敗として終えた   |

モデルやエージェント、プロバイダに起因する失敗は、判別可能な場合は包まず、そのまま伝播する。`turn-failed` の `cause` にはエージェントが報告した詳細が入る。中断されたターンは `AbortError` として通知される。acpx経由のエージェントが対応しないモデルを通知した場合は、acpxの `RequestedModelUnsupportedError`（`code` は `ACP_MODEL_UNSUPPORTED`）がそのまま伝播する。

## 現在の制約

- 権限モードの既定は `deny-all`。書き込みやコマンド実行を許すには `permissionMode` を明示する
- ツールの生の入出力（引数や結果のペイロード）は公開しない。`tool-result` の `text` は表示用に整形したテキストで、長い内容は切り詰める
- ツール名と種類の語彙はバックエンドごとに異なる。`kind` は共通の分類だが、`toolName` はバックエンドが報告した名前のまま
- 思考過程も `reasoning-delta` として常に届く（acpxの `stream: "thought"`、PIの思考差分）。表示しない場合は利用側で無視する
- 会話履歴はセッションのメモリ上にのみ存在し、永続化・復元はできない（acpxのセッションストアとPIのセッションはアダプタがインメモリで持つ）
- セッションをまたいだ履歴の共有はできない
- acpx経由のエージェントは、セッションごとにacpxのランタイムとエージェントプロセスを生成する
- モデルの上書きはacpx経由のエージェントだけで、`createSession({ model })` を指定できる。言語モデルを直接呼び出すエージェントは、モデルをエージェント生成時に固定する
- PIのモデルとその認証は、`model`を指定しない限りPI側の設定に従う。指定した場合もAPIキーは実行時の上書きとして使い、PIの設定ファイルには保存しない
- PIの指示（`instructions`）は、PIの既定のプロンプトを置き換える（PIが足すスキルやコンテキストの節はそのまま）。置き換えるため、PIの既定の指示は残らない
- PIが扱わないプロバイダやモデルを`model`に指定した場合は、セッションの生成に失敗する
- PIを使う場合、Node.js 22.19以降が必要（`engines`）

認証は、acpx経由の場合はエージェント本体（Claude Code、Codexなど）が担い、PIの場合はPIの設定が担う。アダプタはそれをそのまま利用する。

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
