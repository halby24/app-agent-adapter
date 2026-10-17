# uniform-interface

選んだバックエンドを、統一インターフェースのエージェントとして扱うパッケージ。

どのプロバイダやハーネスを、どのモデルで使うかという選択は [provider-management](../provider-management) が扱う。このパッケージは、その選択（`AgentSelection`）を `createAgent()` でバックエンド方式によらない `Agent` に変換し、生成後のセッションの扱いを共通にする。

バックエンドの実装は [backend-adapter](../backend-adapter) に委ねる。`Agent` や `AgentSession` などの型もbackend-adapterの定義をそのまま公開する。

## 使い方

選択の指定は `provider-management` が組み立てる。保存された選択からの復元を含めた手順は、そちらのREADMEを参照。

```ts
import { createAgent } from "uniform-interface";
import { findAgentOption, listAgentOptions } from "provider-management";

// 選択肢を列挙して、利用者に選ばせる
for (const option of listAgentOptions()) {
  console.log(option.kind, option.id, option.label);
}

// 保存された選択などから選択肢を引き当てる
const option = findAgentOption("claude");
if (option?.kind !== "harness") {
  throw new Error("ハーネスが選ばれていない");
}

// 選択した選択肢に、そのバックエンドに必要な指定だけを加える
const agent = createAgent({
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

| API                      | 説明                                       |
| ------------------------ | ------------------------------------------ |
| `createAgent(selection)` | 選んだバックエンドのエージェントを生成する |

`selection` は `provider-management` の `AgentSelection`（`ProviderSelection` / `HarnessSelection`）を取る。`kind`で種類が分かれるため、種類ごとに必要な指定は`option.kind`の判定で分岐できる。

## 現在の制約

- 選択肢の列挙とモデルの選択は扱わない（`provider-management` の役割）
- プロバイダを選ぶ場合は認証済みのモデルを渡す。ハーネスは利用者がエージェント本体のインストールと認証を済ませておく必要がある
- セッションをまたいだ履歴の共有はできない（バックエンドの実装に従う）
- チャット向け／エージェント向けの使い分けは未実装

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
