# app-agent-adapter

ローカルアプリ（Electron、Electrobunなど）から、利用者自身のモデル契約やAPIキーでAIエージェントを動かすためのパッケージ群を開発するモノレポ。

## パッケージ

| パッケージ                                    | 説明                                                                                                      |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [backend-adapter](./packages/backend-adapter) | エージェントのバックエンド（言語モデルの直接呼び出し / acpx経由のACPエージェント）を統一APIで扱うアダプタ |

## 開発

リポジトリのルートで実行する。

```bash
vp install
vp check
vp run -r test
vp run -r build
```

特定のパッケージだけを対象にする場合は `vp -C packages/backend-adapter test` のように指定する。

## ライセンス

MIT
