/**
 * チャットテストアプリの画面。
 *
 * バックエンドとモデルを選び、メインプロセスが返すイベントをそのまま表示する。
 * どのバックエンドがどう動くかは知らず、選んだIDを送り返すだけ。
 */
import { Electroview } from "electrobun/view";
import type { AgentEvent, BackendOption, ChatTestRPC, ModelOption } from "../shared/rpc.ts";

const backendSelect = element<HTMLSelectElement>("#backend");
const modelSelect = element<HTMLSelectElement>("#model");
const modelInput = element<HTMLInputElement>("#model-input");
const apiKeyInput = element<HTMLInputElement>("#api-key");
const instructionsInput = element<HTMLTextAreaElement>("#instructions");
const openButton = element<HTMLButtonElement>("#open");
const closeButton = element<HTMLButtonElement>("#close");
const log = element<HTMLElement>("#log");
const input = element<HTMLTextAreaElement>("#input");
const sendButton = element<HTMLButtonElement>("#send");
const cancelButton = element<HTMLButtonElement>("#cancel");

/** 一覧で選べるバックエンド。`select`の値はこの配列の添字。 */
let backends: readonly BackendOption[] = [];

/** 一覧に無いモデルIDを入力するための、実際のIDと衝突しない選択値。 */
const CUSTOM_MODEL = "__custom_model_id__";

/** セッションが開いているか。 */
let sessionOpen = false;

/** モデル一覧を読み込み中か。 */
let loadingModels = false;

/** ターンを送信中か。 */
let sending = false;

/** 進行中のターンでテキストの差分を受け取ったか。 */
let receivedDelta = false;

/** 進行中のターンの応答を書き込む要素。 */
let assistant: HTMLDivElement | undefined;

const rpc = Electroview.defineRPC<ChatTestRPC>({
  maxRequestTime: Infinity,
  handlers: {
    requests: {},
    messages: {
      agentEvent: ({ event }) => onEvent(event),
      status: ({ message }) => appendSystem(message),
    },
  },
});

new Electroview({ rpc });

backendSelect.addEventListener("change", () => {
  void loadModels();
});

modelSelect.addEventListener("change", () => {
  const custom = modelSelect.value === CUSTOM_MODEL;
  modelInput.hidden = !custom;
  if (custom) {
    modelInput.value = "";
    modelInput.focus();
  }
});

openButton.addEventListener("click", () => {
  void openSession();
});

closeButton.addEventListener("click", () => {
  void closeSession();
});

sendButton.addEventListener("click", () => {
  void send();
});

cancelButton.addEventListener("click", () => {
  void rpc.request.cancel({});
});

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    void send();
  }
});

void initialize();

/** 起動時にバックエンドの一覧を読み込む。 */
async function initialize(): Promise<void> {
  try {
    backends = await rpc.request.listBackends({});
  } catch (error) {
    appendSystem(`バックエンド一覧の取得に失敗しました: ${describe(error)}`);
    return;
  }

  backendSelect.replaceChildren();
  for (const [index, option] of backends.entries()) {
    backendSelect.append(new Option(`${option.label}（${option.kind}）`, String(index)));
  }

  await loadModels();
  updateControls();
  input.focus();
}

/** 選択中のバックエンドが使えるモデルを読み込む。 */
async function loadModels(): Promise<void> {
  const selected = backends[Number(backendSelect.value)];
  if (!selected) return;

  loadingModels = true;
  modelSelect.replaceChildren(new Option("読み込み中…", ""));
  updateControls();

  try {
    const models = await rpc.request.listModels({ kind: selected.kind, id: selected.id });
    if (models.length === 0) {
      // エージェントがモデルを通知しない場合は、IDを直接入力できるようにする。
      showModelInput();
    } else {
      populateModels(models);
    }
  } catch (error) {
    // 一覧が取れなくてもセッションは開けるので、入力できる状態にしておく。
    showModelInput();
    appendSystem(`モデル一覧の取得に失敗しました: ${describe(error)}`);
  } finally {
    loadingModels = false;
    updateControls();
  }
}

/** モデルを自由入力に切り替える。 */
function showModelInput(): void {
  modelSelect.hidden = true;
  modelInput.hidden = false;
  modelInput.value = "";
}

/** 一覧のモデルを選択肢に並べる。一覧に無いIDも試せるようにする。 */
function populateModels(models: readonly ModelOption[]): void {
  modelSelect.replaceChildren();
  for (const model of models) {
    modelSelect.append(new Option(modelLabel(model), model.id));
  }
  modelSelect.append(new Option("その他（モデルIDを入力）", CUSTOM_MODEL));
  modelSelect.hidden = false;
  modelInput.hidden = true;
  modelInput.value = "";
}

/** 選択中のモデルIDを返す。未指定なら`undefined`。 */
function selectedModel(): string | undefined {
  if (modelSelect.hidden || modelSelect.value === CUSTOM_MODEL) {
    return valueOrUndefined(modelInput.value);
  }
  return valueOrUndefined(modelSelect.value);
}

/** 一覧に出すモデルの表示名。IDと違う名前が通知されたときだけ添える。 */
function modelLabel(model: ModelOption): string {
  return model.name === undefined || model.name === model.id
    ? model.id
    : `${model.name}（${model.id}）`;
}

/** 選んだバックエンドでセッションを開始する。 */
async function openSession(): Promise<void> {
  const selected = backends[Number(backendSelect.value)];
  if (!selected) return;

  openButton.disabled = true;
  log.replaceChildren();
  assistant = undefined;

  try {
    const result = await rpc.request.openSession({
      kind: selected.kind,
      id: selected.id,
      model: selectedModel(),
      apiKey: valueOrUndefined(apiKeyInput.value),
      instructions: valueOrUndefined(instructionsInput.value),
    });
    sessionOpen = result.ok;
    if (!result.ok) appendSystem(`セッションを開始できませんでした: ${result.error}`);
  } catch (error) {
    sessionOpen = false;
    appendSystem(`セッションを開始できませんでした: ${describe(error)}`);
  } finally {
    updateControls();
  }
}

/** セッションを閉じる。 */
async function closeSession(): Promise<void> {
  const result = await rpc.request.closeSession({});
  sessionOpen = false;
  updateControls();
  if (!result.ok) appendSystem(`セッションを閉じられませんでした: ${result.error}`);
}

/** 入力中のメッセージを1ターン送信し、イベントを表示する。 */
async function send(): Promise<void> {
  const text = input.value.trim();
  if (text === "" || sending || !sessionOpen) return;

  input.value = "";
  appendBubble("user").textContent = text;
  assistant = undefined;
  receivedDelta = false;
  sending = true;
  updateControls();

  try {
    const result = await rpc.request.send({ text }, { maxRequestTime: Infinity });
    if (!result.ok) appendSystem(`送信に失敗しました: ${result.error}`);
  } catch (error) {
    appendSystem(`送信に失敗しました: ${describe(error)}`);
  } finally {
    sending = false;
    assistant = undefined;
    updateControls();
    input.focus();
  }
}

/** メインプロセスから届いたイベントを表示に反映する。 */
function onEvent(event: AgentEvent): void {
  switch (event.type) {
    case "text-delta":
      receivedDelta = true;
      appendAssistantText(event.text);
      break;

    case "reasoning-delta":
      // チャットでは思考を表示しない。
      break;

    case "tool-call":
      appendSystem(`ツール: ${event.title ?? event.toolName ?? event.toolCallId}`);
      break;

    case "tool-call-update":
    case "tool-result":
      break;

    case "finish": {
      // 差分を出さないバックエンドもあるため、その場合だけ本文を出す。
      if (!receivedDelta && event.text !== "") appendAssistantText(event.text);
      const usage = event.usage;
      const tokens = usage.totalTokens ?? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0);
      appendMeta(`${event.finishReason} / ${tokens} tokens`);
      break;
    }
  }
}

/** 応答の本文に差分を追記する。 */
function appendAssistantText(text: string): void {
  assistant ??= appendBubble("assistant");
  assistant.textContent = (assistant.textContent ?? "") + text;
  scrollToBottom();
}

/** 入力中のテキストを1文字も無いものとして扱う。 */
function valueOrUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** ボタンと入力欄の有効・無効を今の状態に合わせる。 */
function updateControls(): void {
  openButton.disabled = sending || loadingModels;
  closeButton.disabled = !sessionOpen || sending;
  sendButton.disabled = !sessionOpen || sending;
  cancelButton.disabled = !sending;
  input.disabled = !sessionOpen;
  backendSelect.disabled = loadingModels;
  modelSelect.disabled = loadingModels;
  modelInput.disabled = loadingModels;
}

/** 発言の吹き出しを足す。 */
function appendBubble(role: "user" | "assistant"): HTMLDivElement {
  const bubble = document.createElement("div");
  bubble.className = `bubble ${role}`;
  log.append(bubble);
  scrollToBottom();
  return bubble;
}

/** 補足の行を足す。 */
function appendSystem(message: string): void {
  appendLine("system", message);
}

/** ターンの結果などの行を足す。 */
function appendMeta(message: string): void {
  appendLine("meta", message);
}

function appendLine(className: string, message: string): void {
  const line = document.createElement("div");
  line.className = className;
  line.textContent = message;
  log.append(line);
  scrollToBottom();
}

function scrollToBottom(): void {
  log.scrollTop = log.scrollHeight;
}

/** 例外を表示用の文字列にする。 */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 一致する要素を取り出す。無ければ起動時に気付けるよう例外にする。 */
function element<T extends Element>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`要素が見つかりません: ${selector}`);
  return found;
}
