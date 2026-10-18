/**
 * チャットテストアプリのメインプロセス。
 *
 * 画面から受け取った選択でチャット用のエージェントを組み立て、1ターン分の
 * イベントをそのまま画面へ流す。どのバックエンドをどう動かすかは
 * `uniform-interface`と`provider-management`が吸収するため、ここは
 * 「選ぶ・組み立てる・流す」だけを担う。
 */
import { ApplicationMenu, BrowserView, BrowserWindow } from "electrobun/main";
import type { HarnessChoice, ProviderId } from "provider-management";
import { listAgentOptions, listModels } from "provider-management";
import { tmpdir } from "node:os";
import type { AgentSession } from "uniform-interface";
import { createChatAgent } from "uniform-interface";
import type { BackendOption, ChatTestRPC, Result, SessionConfig } from "../shared/rpc.ts";
import { environmentApiKey } from "../shared/api-keys.ts";

/** 進行中のセッション。同時に1つだけ持つ。 */
let session: AgentSession | undefined;

/** 進行中のターンを中断するためのシグナル。 */
let abort: AbortController | undefined;

const rpc = BrowserView.defineRPC<ChatTestRPC>({
  maxRequestTime: 10 * 60_000,
  handlers: {
    requests: {
      listBackends: (): readonly BackendOption[] =>
        listAgentOptions().map((option) => ({
          kind: option.kind,
          id: option.id,
          label: option.label,
        })),

      listModels: async ({ kind, id }) => {
        // 画面が送るIDは一覧から選ばれたものなので、ここでリテラル型に絞る。
        const models =
          kind === "provider"
            ? await listModels({ choice: { kind: "provider", id: id as ProviderId } })
            : await listModels({
                choice: { kind: "harness", id: id as HarnessChoice["id"] },
                cwd: tmpdir(),
              });
        return models.map((model) => ({ id: model.id, name: model.name }));
      },

      openSession: (config) => run(() => openSession(config)),
      send: ({ text }) => run(() => sendTurn(text)),
      cancel: () => {
        abort?.abort();
        return { ok: true };
      },
      closeSession: () => run(closeSession),
    },
    messages: {},
  },
});

const window = new BrowserWindow({
  title: "Chat Test",
  url: "views://mainview/index.html",
  frame: { width: 960, height: 760, x: 200, y: 120 },
  rpc,
});
void window;

// 入力欄でコピー・貼り付け・取り消しを使えるようにする。
ApplicationMenu.setApplicationMenu([
  { label: "Chat Test", submenu: [{ role: "quit" }] },
  {
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "selectAll" },
    ],
  },
]);

/** 例外を結果に畳み、画面にも理由を流す。 */
async function run(action: () => Promise<void>): Promise<Result> {
  try {
    await action();
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    rpc.send.status({ message: `エラー: ${message}` });
    return { ok: false, error: message };
  }
}

/** 選んだバックエンドでセッションを開始する。 */
async function openSession(config: SessionConfig): Promise<void> {
  await closeSession();

  if (config.kind === "provider") {
    const model = config.model?.trim();
    if (!model) throw new Error("モデルを選択してください");

    const apiKey = config.apiKey?.trim() || environmentApiKey(config.id);
    if (!apiKey) throw new Error(`${config.id} のAPIキーを入力してください`);

    session = await createChatAgent({
      kind: "provider",
      id: config.id as ProviderId,
      model,
      apiKey,
      instructions: config.instructions,
    }).createSession();
  } else {
    session = await createChatAgent({
      kind: "harness",
      id: config.id as HarnessChoice["id"],
      model: config.model?.trim() || undefined,
      instructions: config.instructions,
    }).createSession();
  }

  rpc.send.status({ message: `セッションを開始しました（${config.kind}: ${config.id}）` });
}

/** 1ターン送信し、イベントを順に画面へ流す。 */
async function sendTurn(text: string): Promise<void> {
  const current = session;
  if (!current) throw new Error("セッションがありません");

  const controller = new AbortController();
  abort = controller;
  try {
    for await (const event of current.send(text, { abortSignal: controller.signal })) {
      rpc.send.agentEvent({ event });
    }
  } catch (error) {
    // 中断は例外として届くが、失敗ではないので結果としては成功にする。
    if (controller.signal.aborted) {
      rpc.send.status({ message: "ターンを中断しました" });
      return;
    }
    throw error;
  } finally {
    abort = undefined;
  }
}

/** セッションを閉じ、進行中のターンを中断する。 */
async function closeSession(): Promise<void> {
  abort?.abort();
  const current = session;
  session = undefined;
  await current?.close();
}
