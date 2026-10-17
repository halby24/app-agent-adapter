# uniform-interface

エージェントのバックエンドを統一インターフェースで扱うパッケージ。

利用できるプロバイダ（AI SDKの言語モデル）とハーネス（ACP互換のコーディングエージェント）を事前に列挙し、利用者が選んだものを同じAPIのエージェントに変換する。バックエンドごとの違いは選択時の指定に閉じ、生成後のセッションの扱いは共通になる。

バックエンドの実装は [backend-adapter](../backend-adapter) に委ねる。`Agent` や `AgentSession` などの型もbackend-adapterの定義をそのまま公開する。

## 使い方

選択肢は一覧から取得し、選んだ選択肢をそのまま広げて選択の指定を作る。選択肢の`kind`で種類を判定できる。

```ts
import { createAgent, findAgentOption, listAgentOptions } from "uniform-interface";

// 選択肢を列挙して、利用者に選ばせる
for (const option of listAgentOptions()) {
  console.log(option.kind, option.id, option.label);
}

// 保存された選択などから選択肢を引き当てる
const option = findAgentOption("openai");
if (option === undefined) {
  throw new Error("一覧にないバックエンドです");
}

// 選択した選択肢に、そのバックエンドに必要な指定だけを加える
const agent =
  option.kind === "provider"
    ? // モデルの生成（＝APIキーの取り扱い）はアプリ側の責務
      createAgent({ ...option, model: openai("gpt-5.4-mini") })
    : createAgent({
        ...option,
        cwd: "/path/to/project",
        model: "gpt-5.4",
        permissionMode: "approve-all",
      });

const session = await agent.createSession();

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

| API                       | 説明                                                |
| ------------------------- | --------------------------------------------------- |
| `listAgentOptions()`      | 選択できるバックエンドの一覧を返す                  |
| `findAgentOption(id)`     | IDに一致する選択肢を返す。該当がなければ`undefined` |
| `createAgent(selection)`  | 選択したバックエンドのエージェントを生成する        |
| `listAcpxModels(options)` | ハーネス（acpx）が利用できるモデルの一覧を調べる    |

選択の型（`ProviderSelection` / `HarnessSelection`）は、一覧の選択肢の型（`ProviderOption` / `HarnessOption`）に必要な指定を加えたもので、`id`は一覧にある文字列のリテラル型になる。一覧にないIDを指定するとコンパイル時に検出される。

プロバイダのモデルはAI SDKのプロバイダから取得する。ハーネスのモデルはバックエンド固有で、`listAcpxModels()` が使えるのはacpxの組み込み名のハーネスだけになる。

### 一覧の内容

一覧はこのパッケージが組み込みで持つ。選択肢の型は一覧のデータから導出し、この一覧がIDの正本になる。

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
