# provider-management

利用できるプロバイダ、ハーネスと、そのモデルを管理するパッケージ。

アプリが選べるバックエンド（内蔵のエージェントで動かすプロバイダとACP互換のハーネス）を事前に列挙し、選んだものを「選択」（`AgentChoice` = 種類とID）として表す。ハーネスが利用できるかや、モデルの一覧もここで調べ、プロバイダのAPIキーはこのパッケージが保持する。

選んだバックエンドをどう動かすか（作業ディレクトリ、モデル、権限、チャット／エージェントの使い分け）は扱わない。エージェントの生成は [uniform-interface](../uniform-interface) の役割。

## 使い方

```ts
import {
  listModels,
  listAcpxHarnesses,
  listAgentOptions,
  toAgentChoice,
} from "provider-management";

// 選択肢を列挙して、利用者に選ばせる
for (const option of listAgentOptions()) {
  console.log(option.kind, option.id, option.label);
}

// ハーネスが使える状態かを調べる
for (const harness of listAcpxHarnesses()) {
  console.log(harness.id, harness.status);
}

// 選ばれた選択肢から、選択（種類とIDだけ）を取り出す
const option = listAgentOptions().find((entry) => entry.kind === "harness");
const choice = toAgentChoice(option);

// ハーネスが利用できるモデルを調べる（作業ディレクトリは、モデルの調査にも使う）
const models = await listModels({ choice, cwd: "/path/to/project" });

// あとは uniform-interface に、実行時の指定と合わせて渡す
```

プロバイダを選んだ場合は、実行時に使うAPIキーをこのパッケージに保持させる。モデルIDは一覧（後述）から選ぶか、利用者が指定する。

```ts
import { createApiKeyStore } from "provider-management";

// キーの取得（環境変数、キーチェーン、利用者による入力など）は利用者側の責務
const apiKeys = createApiKeyStore({
  openai: process.env.OPENAI_API_KEY,
  anthropic: process.env.ANTHROPIC_API_KEY,
});

const apiKey = apiKeys.get("openai");
if (apiKey === undefined) {
  throw new Error("APIキーが用意されていない");
}
```

## 公開API

| API                          | 説明                                                    |
| ---------------------------- | ------------------------------------------------------- |
| `listAgentOptions()`         | 選択できるバックエンドの一覧を返す                      |
| `findAgentOption(id)`        | IDに一致する選択肢を返す。該当がなければ`undefined`     |
| `toAgentChoice(option)`      | 選択肢から、選択（種類とIDだけ）を取り出す              |
| `listAcpxHarnesses()`        | ハーネスが利用できるかどうかを検出する                  |
| `listModels(options)`        | 選んだバックエンドが使えるモデルの一覧を返す            |
| `toBackendProviderId(id)`    | カタログのプロバイダIDをバックエンドの名前に読み替える  |
| `createApiKeyStore(apiKeys)` | まとめて渡されたプロバイダのAPIキーを保持する場所を作る |

選択肢の型（`ProviderOption` / `HarnessOption`）は一覧のデータから導出し、`id`は一覧にある文字列のリテラル型になる。一覧にないIDを指定するとコンパイル時に検出される。選択の型（`ProviderChoice` / `HarnessChoice` / `AgentChoice`）は、選択肢から種類とIDだけを取り出したもので、`kind`と`id`の対応も型で保たれる（ハーネスのIDをプロバイダとして選ぶとコンパイルエラーになる）。

### ハーネスの利用可否

一覧にあるハーネスが実行できる状態かを検出できる。選択UIで使えるものだけを並べたり、印を付けたりするために使う。

```ts
import { listAcpxHarnesses } from "provider-management";

for (const harness of listAcpxHarnesses()) {
  console.log(harness.id, harness.name, harness.status);
  // 例: opencode OpenCode installed
  //     claude   Claude Code missing
}
```

`status` は3つ。

- `installed`: 実行に必要なものが見つかった
- `missing`: 実行に必要なもの（実行ファイルや、npxで都度取得するパッケージ）が見つからない
- `unknown`: acpxがこの方法では検出しない（実行のたびに取得するタイプなど）。未インストールとは限らない

検出は `PATH` とローカルのパッケージを見るだけで、エージェントのプロセスは起動しない。**認証済みかどうかまでは分からない**ため、実際に使えるかどうかはセッションの生成で確かめる必要がある。`name` はacpxが定義する表示名（`"Claude Code"`など）で、名前が分からない場合はIDと同じ。

### モデル一覧

選んだバックエンドが使えるモデルは `listModels()` が返す。バックエンドごとの違いはこの関数が吸収する。

```ts
import { listModels } from "provider-management";

// プロバイダ（内蔵のコーディングエージェントが持つモデル定義から返す。問い合わせも認証も不要）
const models = await listModels({ choice: { kind: "provider", id: "anthropic" } });

// ハーネス（acpxで調べるため、エージェントのプロセスを1つ起動する）
const agentModels = await listModels({
  choice: { kind: "harness", id: "claude" },
  cwd: "/path/to/project",
});
```

プロバイダの場合、返るIDは内蔵のコーディングエージェントの体系に従う。

### APIキーの保持

キーの取得は利用者側の責務で、集めたキーを `{ [プロバイダID]: string }` の形でまとめて `createApiKeyStore()` に渡す。キーを設定しないプロバイダは省略するか`undefined`を渡す。空文字は未設定として扱う。

`get(providerId)` で取り出し、`has(providerId)` で設定の有無を確認できる。キーの写しを持つため、渡したオブジェクトを後から書き換えても保持している内容は変わらない。

### 一覧の内容

一覧はこのパッケージが組み込みで持つ。この一覧がIDの正本になる。

- プロバイダ: 内蔵のコーディングエージェント（PI Coding Agent）で使えるもの
- ハーネス: acpxの組み込みエージェント名（`claude`、`codex`など）。表示名の別名は持たず、IDをそのまま表示に使う

acpxがエージェントを追加・改名した場合や、対応するプロバイダを増やす場合は、一覧の見直しが必要になる。

## 現在の制約

- カタログのプロバイダは、内蔵のコーディングエージェントが扱えて、APIキーだけで動かせるものに限っている
- プロバイダのモデル一覧は、内蔵のコーディングエージェントに同梱された定義から返す（新モデルの反映はその更新に依存する）
- ハーネスのモデル一覧を調べられるのは、acpxの組み込み名のハーネスだけ。ACPサーバを起動するコマンドを指定した場合は調べられない
- ハーネスの利用可否は実行ファイルとローカルパッケージの有無で判断するため、認証の状態や、実行時に失敗するかどうかまでは分からない
- 認証は保持したAPIキーを取り出せるだけで、ハーネスの認証はエージェント本体に委ねる
- 選んだバックエンドをどう動かすか（作業ディレクトリ、モデル、権限、チャット／エージェントの使い分け）は扱わない

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
