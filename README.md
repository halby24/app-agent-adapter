# app-agent-adapter

ローカルアプリ（Electron、Electrobunなど）から、利用者自身のモデル契約やAPIキーでAIエージェントを動かすためのパッケージ群を開発するモノレポ。

## パッケージ

| パッケージ                                            | 説明                                                                                                                        |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| [backend-adapter](./packages/backend-adapter)         | エージェントのバックエンド（acpx経由のACPエージェント / 内蔵のPI Coding Agent〈コーディング用とチャット用〉）をアダプタする |
| [provider-management](./packages/provider-management) | 利用できるプロバイダやハーネス、そのモデルを管理し、選んだバックエンドを種類とIDで表す                                      |
| [uniform-interface](./packages/uniform-interface)     | 選んだバックエンドを、チャット用／エージェント向けの統一インターフェースで扱う                                              |

## サンプルアプリ

| アプリ                             | 説明                                                                 |
| ---------------------------------- | -------------------------------------------------------------------- |
| [apps/chat-test](./apps/chat-test) | バックエンドとモデルを選んでチャットを試すElectrobun 2系の簡易アプリ |

## 開発

リポジトリのルートで実行する。

```bash
vp install
vp run -r build
vp check
vp run -r test
```

パッケージ間の依存は `dist` 経由で解決するため、チェックとテストの前に一度ビルドしておく。

特定のパッケージだけを対象にする場合は `vp -C packages/backend-adapter test` のように指定する。

サンプルアプリの起動方法などは [apps/chat-test](./apps/chat-test) を参照する。

## ライセンス

MIT
