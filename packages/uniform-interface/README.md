# uniform-interface

エージェントのバックエンドを統一インターフェースで扱うパッケージ。

利用できるプロバイダ（AI SDKの言語モデル）とハーネス（ACP互換のコーディングエージェント）を事前に列挙し、利用者が選んだものを同じAPIのエージェントに変換する。バックエンドごとの違いは選択時の指定に閉じ、生成後のセッションの扱いは共通になる。

バックエンドの実装は [backend-adapter](../backend-adapter) に委ねる。`Agent` や `AgentSession` などの型もbackend-adapterの定義をそのまま公開する。

## 使い方

```ts
import { createAgent, listAgentOptions } from "uniform-interface";

// 選択肢を列挙して、利用者に選ばせる
for (const option of listAgentOptions()) {
  console.log(option.kind, option.id, option.label);
}

// プロバイダを選んだ場合。モデルの生成（＝APIキーの取り扱い）はアプリ側の責務
const providerAgent = createAgent({
  kind: "provider",
  id: "openai",
  model: openai("gpt-5.4-mini"),
  instructions: "あなたは簡潔に答えるアシスタントです。",
});

// ハーネスを選んだ場合
const harnessAgent = createAgent({
  kind: "harness",
  id: "claude",
  cwd: "/path/to/project",
  permissionMode: "approve-all",
});

const session = await providerAgent.createSession();

try {
  for await (const event of session.send("こんにちは")) {
    if (event.type === "text-delta") {
      process.stdout.write(event.text);
    }
  }
} finally {
  await session.close();
}
```

## 公開API

| API                      | 説明                                                |
| ------------------------ | --------------------------------------------------- |
| `listAgentOptions()`     | 選択できるバックエンドの一覧を返す                  |
| `findAgentOption(id)`    | IDに一致する選択肢を返す。該当がなければ`undefined` |
| `createAgent(selection)` | 選択したバックエンドのエージェントを生成する        |

`createAgent()` は、一覧にないID（`option-not-found`）や、一覧の種類と一致しない指定（`option-kind-mismatch`）を `AgentSelectionError` で通知する。

### 一覧の内容

一覧はこのパッケージが組み込みで持つ。

- プロバイダ: AI SDKの公式プロバイダのうち言語モデルを提供するもの。選択に必要なパッケージ名（`@ai-sdk/openai`など）を`package`に持つ
- ハーネス: acpxの組み込みエージェント名（`claude`、`codex`など）。表示名の別名は持たず、IDをそのまま表示に使う

acpxがエージェントを追加・改名した場合は、一覧の見直しが必要になる。

## 現在の制約

- モデルの生成と認証はアプリ側の責務。プロバイダを選ぶ場合は認証済みのモデルを渡す（認証仲介は未実装）
- ハーネスは利用者がエージェント本体のインストールと認証を済ませておく必要がある
- 選択できるのは一覧にあるものだけで、アプリ側から選択肢を追加することはできない

## 開発

リポジトリのルートで実行する。

```bash
vp install
vp run -r build
vp check
vp run -r test
```

`backend-adapter` の型とコードを `dist` から解決するため、チェックとテストの前に一度ビルドしておく。このパッケージだけを対象にする場合は `vp -C packages/uniform-interface test` のように指定する。

## ライセンス

MIT
