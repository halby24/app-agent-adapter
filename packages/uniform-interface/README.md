# uniform-interface

選んだバックエンドを、用途ごとの統一インターフェースで扱うパッケージ。

どのプロバイダやハーネスを選ぶかは [provider-management](../provider-management) が扱い、このパッケージは選ばれたバックエンド（`AgentChoice` = 種類とID）を、用途に合わせて2つの入口でバックエンド方式によらない `Agent` に変換する。

| 入口                | 用途                                                     |
| ------------------- | -------------------------------------------------------- |
| `createChatAgent`   | ファイルを扱わず、ツールも使わないチャット               |
| `createCodingAgent` | 作業ディレクトリを指定し、ファイルを扱わせるエージェント |

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
    : // プロバイダのエージェント向けは未対応
      createChatAgent({ ...choice, model: openai("gpt-5.4-mini") });

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

| 選択       | 必要な指定                            | 動作                                                                                       |
| ---------- | ------------------------------------- | ------------------------------------------------------------------------------------------ |
| `provider` | `model`（`LanguageModel`）            | モデルを直接呼び出す（tool useなし）                                                       |
| `harness`  | `model?`（モデルID）、`instructions?` | セッションごとに使い捨ての作業ディレクトリを作り、`"deny-all"`で操作を拒否した状態で動かす |

ハーネスのチャットには作業ディレクトリの指定がないため、一時領域に使い捨てのディレクトリを作る。片付けはセッションの`close()`で行い、セッションの生成に失敗した場合も作成したディレクトリを削除する。

### エージェント向け

| 選択       | 必要な指定                                                  | 動作                         |
| ---------- | ----------------------------------------------------------- | ---------------------------- |
| `harness`  | `cwd`（必須）、`model?`、`instructions?`、`permissionMode?` | acpxのエージェントを起動する |
| `provider` | 未対応                                                      | —                            |

## 現在の制約

- プロバイダを選んだ場合のエージェント向け（tool useあり、作業ディレクトリあり）は未対応。`createCodingAgent` の設定に含めていないため、コンパイル時に検出される
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
