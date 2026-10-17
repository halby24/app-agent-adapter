# provider-management

利用できるプロバイダ、ハーネスと、そのモデルを管理するパッケージ。

アプリが選べるバックエンド（AI SDKのプロバイダとACP互換のハーネス）を事前に列挙し、選んだバックエンドを1つの指定（`AgentSelection`）にまとめる。ハーネスが利用できるモデルはバックエンドから調べる。プロバイダのAPIキーはこのパッケージが保持する。エージェントの生成は行わず、まとめた指定を [uniform-interface](../uniform-interface) に渡す。

## 使い方

```ts
import { findAgentOption, listAcpxModels, listAgentOptions } from "provider-management";

// 選択肢を列挙して、利用者に選ばせる
for (const option of listAgentOptions()) {
  console.log(option.kind, option.id, option.label);
}

// ハーネスが利用できるモデルを調べる
const models = await listAcpxModels({ agent: "claude", cwd: "/path/to/project" });

// 選んだ選択肢を、そのバックエンドに必要な指定と合わせて1つにまとめる
const option = findAgentOption("claude");
if (option?.kind !== "harness") {
  throw new Error("ハーネスが選ばれていない");
}

const selection = {
  ...option,
  cwd: "/path/to/project",
  model: models[0]?.id,
  permissionMode: "approve-all",
} as const;

// あとは uniform-interface の createAgent に渡す
```

プロバイダを選んだ場合は、モデル（AI SDKのプロバイダから取得したもの）を指定に入れる。モデルの生成に使うAPIキーは、このパッケージに保持させる。

```ts
import { createApiKeyStore, findAgentOption } from "provider-management";

// キーの取得（環境変数、キーチェーン、利用者による入力など）は利用者側の責務
const apiKeys = createApiKeyStore({
  openai: process.env.OPENAI_API_KEY,
  anthropic: process.env.ANTHROPIC_API_KEY,
});

const option = findAgentOption("openai");
if (option?.kind !== "provider") {
  throw new Error("プロバイダが選ばれていない");
}

const apiKey = apiKeys.get(option.id);
if (apiKey === undefined) {
  throw new Error("APIキーが設定されていない");
}

const selection = { ...option, model: createOpenAI({ apiKey })("gpt-5.4-mini") } as const;
```

## 公開API

| API                          | 説明                                                    |
| ---------------------------- | ------------------------------------------------------- |
| `listAgentOptions()`         | 選択できるバックエンドの一覧を返す                      |
| `findAgentOption(id)`        | IDに一致する選択肢を返す。該当がなければ`undefined`     |
| `listAcpxModels(options)`    | ハーネス（acpx）が利用できるモデルの一覧を調べる        |
| `createApiKeyStore(apiKeys)` | まとめて渡されたプロバイダのAPIキーを保持する場所を作る |

選択肢の型（`ProviderOption` / `HarnessOption`）は一覧のデータから導出し、`id`は一覧にある文字列のリテラル型になる。一覧にないIDを指定するとコンパイル時に検出される。選択の型（`ProviderSelection` / `HarnessSelection` / `AgentSelection`）は、選択肢の型にそのバックエンドで必要な指定を加えたもの。

### APIキーの保持

キーの取得は利用者側の責務で、集めたキーを `{ [プロバイダID]: string }` の形でまとめて `createApiKeyStore()` に渡す。キーを設定しないプロバイダは省略するか`undefined`を渡す。空文字は未設定として扱う。

`get(providerId)` で取り出し、`has(providerId)` で設定の有無を確認できる。キーの写しを持つため、渡したオブジェクトを後から書き換えても保持している内容は変わらない。

### 一覧の内容

一覧はこのパッケージが組み込みで持つ。この一覧がIDの正本になる。

- プロバイダ: AI SDKの公式プロバイダのうち言語モデルを提供するもの。選択に必要なパッケージ名（`@ai-sdk/openai`など）を`package`に持つ
- ハーネス: acpxの組み込みエージェント名（`claude`、`codex`など）。表示名の別名は持たず、IDをそのまま表示に使う

acpxがエージェントを追加・改名した場合は、一覧の見直しが必要になる。

## 現在の制約

- モデルの一覧を調べられるのは、acpxの組み込み名のハーネスだけ。ACPサーバを起動するコマンドを指定した場合は調べられない
- プロバイダのモデル一覧は扱わない。モデルはAI SDKのプロバイダから取得する
- 認証の管理は未実装。保持したAPIキーはまだモデルの生成に使わず、生成は利用者側が行う。ハーネスの認証はエージェント本体に委ねる
- エージェントの生成と、チャット／エージェントの使い分けは扱わない

## 開発

リポジトリのルートで実行する。

```bash
vp install
vp run -r build
vp check
vp run -r test
```

`backend-adapter` の型を `dist` から解決するため、チェックとテストの前に一度ビルドしておく。このパッケージだけを対象にする場合は `vp -C packages/provider-management test` のように指定する。

## ライセンス

MIT
