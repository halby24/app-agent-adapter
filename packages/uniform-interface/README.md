# uniform-interface

選んだバックエンドを、用途ごとの統一インターフェースで扱うパッケージ。

どのプロバイダやハーネスを選ぶかは [provider-management](../provider-management) が扱い、このパッケージは選ばれたバックエンド（`AgentChoice` = 種類とID）を、用途に合わせて2つの入口でバックエンド方式によらない `Agent` に変換する。

| 入口                | 用途                                                     | 使うバックエンド                                       |
| ------------------- | -------------------------------------------------------- | ------------------------------------------------------ |
| `createChatAgent`   | ファイルを扱わず、ツールも使わないチャット               | プロバイダはモデル直呼び、ハーネスはacpx（操作は拒否） |
| `createCodingAgent` | 作業ディレクトリを指定し、ファイルを扱わせるエージェント | ハーネスはacpx、プロバイダは内蔵のPI Coding Agent      |

どちらの入口も、選んだ種類に応じてバックエンドを使い分ける。利用者側は、どのバックエンドが動くかを意識しなくてよい。

バックエンドの実装は [backend-adapter](../backend-adapter) に委ねる。`Agent` や `AgentSession` などの型もbackend-adapterの定義をそのまま公開する。

## 使い方

選択は `provider-management` の一覧から作り、`toAgentChoice()` で種類とIDだけを取り出す。実行時の指定（モデル、作業ディレクトリ、権限）はこのパッケージの設定に足す。

```ts
import { createChatAgent, createCodingAgent } from "uniform-interface";
import { findAgentOption, toAgentChoice } from "provider-management";

const option = findAgentOption("claude");
if (option === undefined) {
  throw new Error("一覧にないバックエンドです");
}

const choice = toAgentChoice(option);

const agent =
  choice.kind === "harness"
    ? createCodingAgent({
        ...choice,
        cwd: "/path/to/project",
        model: "gpt-5.4",
        permissionMode: "approve-all",
      })
    : createCodingAgent({
        ...choice,
        cwd: "/path/to/project",
        model: "claude-haiku-4-5",
        apiKey: apiKey,
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

| API                          | 説明                                     |
| ---------------------------- | ---------------------------------------- |
| `createChatAgent(options)`   | チャット用のエージェントを生成する       |
| `createCodingAgent(options)` | エージェント向けのエージェントを生成する |

どちらも、選んだバックエンドに応じて必要な指定が変わるため、`kind`で判別できるunionを取る。種類ごとに必要な指定が足りない場合や、種類とIDの対応が崩れている場合（ハーネスのIDをプロバイダとして渡すなど）はコンパイル時に検出される。

### チャット

| 選択       | 必要な指定                                     | 動作                                                                                       |
| ---------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `provider` | `model`（モデルID）、`apiKey`、`instructions?` | モデルを組み立てて直接呼び出す（tool useなし）                                             |
| `harness`  | `model?`（モデルID）、`instructions?`          | セッションごとに使い捨ての作業ディレクトリを作り、`"deny-all"`で操作を拒否した状態で動かす |

プロバイダのチャットもハーネスと同じく、モデルはIDとAPIキーで指定する（`LanguageModel`は渡さない）。モデルの組み立てはセッションの生成時に行うため、`createChatAgent()` 自体はSDKの読み込みを待たない。

ハーネスのチャットには作業ディレクトリの指定がないため、一時領域に使い捨てのディレクトリを作る。片付けはセッションの`close()`で行い、セッションの生成に失敗した場合も作成したディレクトリを削除する。

### エージェント向け

| 選択       | 必要な指定                                                           | バックエンド                   |
| ---------- | -------------------------------------------------------------------- | ------------------------------ |
| `harness`  | `cwd`（必須）、`model?`、`instructions?`、`permissionMode?`          | acpx（エージェントを起動する） |
| `provider` | `cwd`（必須）、`model`、`apiKey`、`instructions?`、`permissionMode?` | 内蔵のPI Coding Agent          |

どちらのバックエンドが使われるかは選んだ種類で決まり、利用者側で意識する必要はない。プロバイダを選んだ場合のモデルは、チャットと違い**モデルIDとAPIキー**で指定する（バックエンドがプロバイダのモデルとして解決するため）。

```ts
const agent = createCodingAgent({
  kind: "provider",
  id: "anthropic",
  cwd: "/path/to/project",
  model: "claude-haiku-4-5",
  apiKey: apiKey,
  permissionMode: "approve-all",
});
```

バックエンドが扱うプロバイダ名は、カタログのID（AI SDKのプロバイダ名）と一致しないことがある（`togetherai` → `together`など）。この読み替えはこのパッケージが行う。

## 現在の制約

- プロバイダを選んだ場合のエージェント向けは、バックエンドが扱うプロバイダとモデルに限る。カタログのプロバイダはこれに合わせて選んでいる（`listAgentOptions()`）。モデルのIDはバックエンドの体系なので、`provider-management`の`listPiModels()`で調べる
- モデルはチャットもエージェント向けもIDとAPIキーで指定する。IDは`provider-management`の`listModels()`で調べられる。モデルの組み立てに必要なSDKは`provider-management`の依存に含まれる
- セッション単位のモデル上書きは扱わない（エージェント生成時の指定のみ）
- ハーネスのチャットは使い捨ての作業ディレクトリを`close()`で片付ける。セッションを閉じないままプロセスが終わると、一時領域にディレクトリが残る
- 選択肢の列挙・モデルの選択・APIキーの保持は `provider-management` の役割

## 開発

リポジトリのルートで実行する。

```bash
vp install
vp run -r build
vp check
vp run -r test
```

`backend-adapter` と `provider-management` の型とコードを `dist` から解決するため、チェックとテストの前に一度ビルドしておく。このパッケージだけを対象にする場合は `vp -C packages/uniform-interface test` のように指定する。

## ライセンス

MIT
