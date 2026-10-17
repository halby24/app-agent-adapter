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

プロバイダを選んだ場合は、モデルを指定に入れる。モデルIDは、プロバイダのSDKから取得した一覧（後述）から選ぶか、利用者が指定する。モデルの生成に使うAPIキーは、このパッケージに保持させる。

```ts
import { createApiKeyStore, listProviderModels } from "provider-management";

// キーの取得（環境変数、キーチェーン、利用者による入力など）は利用者側の責務
const apiKeys = createApiKeyStore({
  openai: process.env.OPENAI_API_KEY,
  anthropic: process.env.ANTHROPIC_API_KEY,
});

// プロバイダのSDKでモデル一覧を取得する
const models = await listProviderModels({ providerId: "openai", apiKeys });

const option = findAgentOption("openai");
if (option?.kind !== "provider") {
  throw new Error("プロバイダが選ばれていない");
}

const apiKey = apiKeys.get(option.id);
const modelId = models[0]?.id;
if (apiKey === undefined || modelId === undefined) {
  throw new Error("APIキーかモデルが用意されていない");
}

const selection = { ...option, model: createOpenAI({ apiKey })(modelId) } as const;
```

## 公開API

| API                           | 説明                                                    |
| ----------------------------- | ------------------------------------------------------- |
| `listAgentOptions()`          | 選択できるバックエンドの一覧を返す                      |
| `findAgentOption(id)`         | IDに一致する選択肢を返す。該当がなければ`undefined`     |
| `listAcpxModels(options)`     | ハーネス（acpx）が利用できるモデルの一覧を調べる        |
| `listProviderModels(options)` | プロバイダが提供するモデルの一覧をそのSDKで取得する     |
| `createApiKeyStore(apiKeys)`  | まとめて渡されたプロバイダのAPIキーを保持する場所を作る |

選択肢の型（`ProviderOption` / `HarnessOption`）は一覧のデータから導出し、`id`は一覧にある文字列のリテラル型になる。一覧にないIDを指定するとコンパイル時に検出される。選択の型（`ProviderSelection` / `HarnessSelection` / `AgentSelection`）は、選択肢の型にそのバックエンドで必要な指定を加えたもの。

### プロバイダのモデル一覧

プロバイダのモデル一覧は、そのプロバイダの公式SDKを利用時に読み込んで取得する。対応しているのは次の3つ。

| プロバイダ  | 使うSDK             | モデル名                          |
| ----------- | ------------------- | --------------------------------- |
| `openai`    | `openai`            | SDKが返すIDをそのまま使う         |
| `anthropic` | `@anthropic-ai/sdk` | SDKが返す表示名を`name`に入れる   |
| `google`    | `@google/genai`     | `models/`の接頭辞を除いたIDを返す |

このパッケージはSDKを依存に持たない。アプリが、使うプロバイダのSDKを自身の依存に追加しておく（読み込めない場合は追加を促すエラーになる）。対応していないプロバイダでは、モデルIDを利用者が指定する。

### APIキーの保持

キーの取得は利用者側の責務で、集めたキーを `{ [プロバイダID]: string }` の形でまとめて `createApiKeyStore()` に渡す。キーを設定しないプロバイダは省略するか`undefined`を渡す。空文字は未設定として扱う。

`get(providerId)` で取り出し、`has(providerId)` で設定の有無を確認できる。キーの写しを持つため、渡したオブジェクトを後から書き換えても保持している内容は変わらない。

### 一覧の内容

一覧はこのパッケージが組み込みで持つ。この一覧がIDの正本になる。

- プロバイダ: AI SDKの公式プロバイダのうち言語モデルを提供するもの。選択に必要なパッケージ名（`@ai-sdk/openai`など）を`package`に持つ
- ハーネス: acpxの組み込みエージェント名（`claude`、`codex`など）。表示名の別名は持たず、IDをそのまま表示に使う

acpxがエージェントを追加・改名した場合は、一覧の見直しが必要になる。

## 現在の制約

- モデルの一覧を調べられるプロバイダは、`openai` / `anthropic` / `google` の3つ。それ以外はモデルIDを利用者が指定する
- プロバイダのモデル一覧を取得するには、アプリが該当のSDKを依存に追加しておく必要がある
- ハーネスのモデル一覧を調べられるのは、acpxの組み込み名のハーネスだけ。ACPサーバを起動するコマンドを指定した場合は調べられない
- 認証は保持したAPIキーを取り出せるだけで、モデルの生成にはまだ使わない。生成は利用者側が行う。ハーネスの認証はエージェント本体に委ねる
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
