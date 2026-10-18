import type { AgentSessionEvent, AgentSession as PiSession } from "@earendil-works/pi-coding-agent";
import { beforeEach, expect, test, vi } from "vite-plus/test";
import { createPiAgent } from "../src/pi-agent.ts";
import { AgentError } from "../src/index.ts";
import type { AgentEvent } from "../src/index.ts";

const pi = vi.hoisted(() => ({
  sessionOptions: [] as unknown[],
  resourceLoaderOptions: [] as unknown[],
  resourceLoaderReloads: 0,
  inMemoryCwd: [] as Array<string | undefined>,
  runtimeApiKeys: [] as Array<{ provider: string; apiKey: string }>,
  knownProviders: [] as string[],
  knownModels: [] as Array<{ provider: string; id: string }>,
}));

/** ターン1回分の台本。 */
interface TurnScript {
  deltas?: readonly string[];
  thinkingDeltas?: readonly string[];
  /** ツール実行など、そのまま流すイベント。 */
  events?: readonly unknown[];
  usage?: { input: number; output: number; totalTokens: number };
  stopReason?: string;
  errorMessage?: string;
  hold?: Promise<void>;
  /** `prompt()`自体を失敗させる場合のメッセージ。 */
  reject?: string;
}

class FakePiSession {
  readonly messages: unknown[] = [];
  readonly prompts: string[] = [];
  readonly unsubscribed: number[] = [];
  readonly navigations: Array<{ targetId: string; summarize: boolean }> = [];
  aborts = 0;
  disposes = 0;
  /** 現在の末尾エントリ。空の履歴では`null`。 */
  leafId: string | null = null;
  /** 履歴エントリ（直線のみ。一時停止も分岐も作らない）。 */
  readonly entries: Array<{ id: string; type: "message"; message: { role: string } }> = [];
  #listeners: Array<(event: AgentSessionEvent) => void> = [];
  #counter = 0;
  /** `abort()`で中断要求があったかどうか。保留中の`prompt()`が再開時に読む。 */
  #abortRequested = false;

  constructor(private readonly scripts: TurnScript[]) {}

  readonly sessionManager = {
    getLeafId: (): string | null => this.leafId,
    getBranch: (): Array<{ id: string; type: "message"; message: { role: string } }> => [
      ...this.entries,
    ],
  };

  subscribe(listener: (event: AgentSessionEvent) => void): () => void {
    this.#listeners.push(listener);
    return () => {
      this.unsubscribed.push(this.#listeners.indexOf(listener));
      this.#listeners = this.#listeners.filter((entry) => entry !== listener);
    };
  }

  async prompt(text: string): Promise<void> {
    this.prompts.push(text);
    const script = this.scripts.shift() ?? {};
    // 待機前のAbortは無害とする（実SDKの再現）。実行中のAbortだけが中断になる。
    this.#abortRequested = false;
    if (script.reject !== undefined) {
      throw new Error(script.reject);
    }
    const userId = `entry-${(this.#counter += 1)}`;
    this.entries.push({ id: userId, type: "message", message: { role: "user" } });
    for (const delta of script.thinkingDeltas ?? []) {
      this.#emit({
        type: "message_update",
        assistantMessageEvent: { type: "thinking_delta", delta },
      });
    }
    for (const delta of script.deltas ?? []) {
      this.#emit({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta } });
    }
    for (const event of script.events ?? []) {
      this.#emit(event);
    }
    if (script.hold !== undefined) {
      await script.hold;
    }
    // 保留中に中断されていたら、中断の停止理由で終わる（実SDKの再現）。
    const interrupted = this.#abortRequested;
    this.#abortRequested = false;
    const assistantId = `entry-${(this.#counter += 1)}`;
    this.entries.push({ id: assistantId, type: "message", message: { role: "assistant" } });
    this.leafId = assistantId;
    this.messages.push({
      role: "assistant",
      usage: script.usage ?? { input: 5, output: 3, totalTokens: 8 },
      stopReason: script.stopReason ?? (interrupted ? "aborted" : "stop"),
      errorMessage: script.errorMessage,
    });
  }

  async navigateTree(targetId: string, options?: { summarize?: boolean }): Promise<unknown> {
    this.navigations.push({ targetId, summarize: options?.summarize ?? false });
    // 実SDKの再現: 自分のユーザーメッセージまで戻すと、その親に戻る。
    const index = this.entries.findIndex((entry) => entry.id === targetId);
    const target = this.entries[index];
    if (target?.type === "message" && target.message.role === "user") {
      this.leafId = index > 0 ? (this.entries[index - 1]?.id ?? null) : null;
    } else {
      this.leafId = targetId;
    }
    return { cancelled: false };
  }

  abort(): Promise<void> {
    this.aborts += 1;
    this.#abortRequested = true;
    return Promise.resolve();
  }

  dispose(): void {
    this.disposes += 1;
  }

  #emit(event: unknown): void {
    for (const listener of this.#listeners) {
      listener(event as AgentSessionEvent);
    }
  }
}

const fakes: FakePiSession[] = [];

vi.mock("@earendil-works/pi-coding-agent", () => ({
  createAgentSession: (options: unknown) => {
    pi.sessionOptions.push(options);
    const session = new FakePiSession(scripts.shift() ?? []);
    fakes.push(session);
    return Promise.resolve({ session: session as unknown as PiSession });
  },
  SessionManager: {
    inMemory: (cwd?: string) => {
      pi.inMemoryCwd.push(cwd);
      return { kind: "in-memory" };
    },
  },
  DefaultResourceLoader: class {
    readonly #options: Record<string, unknown>;

    constructor(options: Record<string, unknown>) {
      this.#options = options;
      pi.resourceLoaderOptions.push(options);
    }

    reload(): Promise<void> {
      pi.resourceLoaderReloads += 1;
      return Promise.resolve();
    }

    /** 置き換えたシステムプロンプトを取り出す。 */
    systemPrompt(): string | undefined {
      const override = this.#options.systemPromptOverride;
      return typeof override === "function" ? (override as () => string)() : undefined;
    }

    /** 追加のシステムプロンプトを取り出す。 */
    appendedSystemPrompts(): string[] {
      const override = this.#options.appendSystemPromptOverride;
      return typeof override === "function" ? (override as (base: string[]) => string[])([]) : [];
    }
  },
  getAgentDir: () => "/agent-dir",
  ModelRuntime: {
    create: () =>
      Promise.resolve({
        getProvider: (providerId: string) =>
          pi.knownProviders.includes(providerId) ? { id: providerId } : undefined,
        setRuntimeApiKey: (provider: string, apiKey: string) => {
          pi.runtimeApiKeys.push({ provider, apiKey });
          return Promise.resolve();
        },
        getModel: (provider: string, id: string) =>
          pi.knownModels.some((entry) => entry.provider === provider && entry.id === id)
            ? { id, provider }
            : undefined,
      }),
  },
}));

let scripts: TurnScript[][] = [];

beforeEach(() => {
  scripts = [];
  fakes.length = 0;
  pi.sessionOptions.length = 0;
  pi.resourceLoaderOptions.length = 0;
  pi.resourceLoaderReloads = 0;
  pi.inMemoryCwd.length = 0;
  pi.runtimeApiKeys.length = 0;
  pi.knownProviders = [];
  pi.knownModels = [];
});

function createAgent(
  options?: Parameters<typeof createPiAgent>[0],
): ReturnType<typeof createPiAgent> {
  return createPiAgent(options ?? { cwd: "/project" });
}

async function collect(events: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const collected: AgentEvent[] = [];
  for await (const event of events) {
    collected.push(event);
  }
  return collected;
}

test("作業ディレクトリと操作の範囲を指定してセッションを生成する", async () => {
  scripts = [[]];

  await (
    await createAgent({ cwd: "/project", permissionMode: "approve-all" }).createSession()
  ).close();

  expect(pi.sessionOptions[0]).toMatchObject({
    cwd: "/project",
    // 会話履歴はディスクに残さない。
    sessionManager: { kind: "in-memory" },
    // 操作をすべて許す場合は、読み取りに加えて書き込みとコマンド実行のツールも渡す。
    tools: ["read", "grep", "find", "ls", "bash", "edit", "write"],
  });
  expect(pi.inMemoryCwd[0]).toBe("/project");
});

test("deny-allとapprove-readsでは読み取りだけのツールを渡す", async () => {
  scripts = [[], []];

  await (await createAgent({ cwd: "/project" }).createSession()).close();
  await (
    await createAgent({ cwd: "/project", permissionMode: "approve-reads" }).createSession()
  ).close();

  expect(pi.sessionOptions.map((options) => (options as { tools: string[] }).tools)).toEqual([
    ["read", "grep", "find", "ls"],
    ["read", "grep", "find", "ls"],
  ]);
});

test("エージェントの指示をPIのシステムプロンプトの置き換えとして渡す", async () => {
  scripts = [[], []];

  const agent = createAgent({ cwd: "/project", instructions: "be brief" });
  const first = await agent.createSession();
  const second = await agent.createSession({ instructions: "be thorough" });

  const loaders = pi.sessionOptions.map(
    (options) =>
      (
        options as {
          resourceLoader: { systemPrompt(): string | undefined; appendedSystemPrompts(): string[] };
        }
      ).resourceLoader,
  );
  expect(pi.resourceLoaderOptions[0]).toMatchObject({ cwd: "/project", agentDir: "/agent-dir" });
  expect(loaders.map((loader) => loader.systemPrompt())).toEqual(["be brief", "be thorough"]);
  // 置き換える場合は、PIが既定で足す追加指示を足さない。
  expect(loaders.map((loader) => loader.appendedSystemPrompts())).toEqual([[], []]);
  // 読み込みを確定させるため、リロードを呼ぶ。
  expect(pi.resourceLoaderReloads).toBe(2);

  await first.close();
  await second.close();
});

test("指示を指定しない場合は、PIの既定のプロンプトをそのまま使う", async () => {
  scripts = [[]];

  await (await createAgent({ cwd: "/project" }).createSession()).close();

  expect(pi.resourceLoaderOptions[0]).toEqual({ cwd: "/project", agentDir: "/agent-dir" });
});

test("モデルを指定すると、実行時のAPIキーで解決してセッションに渡す", async () => {
  scripts = [[]];
  pi.knownProviders = ["anthropic"];
  pi.knownModels = [{ provider: "anthropic", id: "claude-sonnet-4-5" }];

  await (
    await createAgent({
      cwd: "/project",
      model: { provider: "anthropic", id: "claude-sonnet-4-5", apiKey: "sk-ant" },
    }).createSession()
  ).close();

  // APIキーは実行時の上書きとして渡す（PIの設定ファイルには保存しない）。
  expect(pi.runtimeApiKeys).toEqual([{ provider: "anthropic", apiKey: "sk-ant" }]);
  expect(pi.sessionOptions[0]).toMatchObject({
    model: { id: "claude-sonnet-4-5", provider: "anthropic" },
  });
});

test("モデルを指定しない場合は、PIの設定に従う（実行時の上書きをしない）", async () => {
  scripts = [[]];

  await (await createAgent({ cwd: "/project" }).createSession()).close();

  expect(pi.runtimeApiKeys).toEqual([]);
  expect(pi.sessionOptions[0]).not.toHaveProperty("model");
});

test("バックエンドが扱わないプロバイダを指定すると失敗する", async () => {
  scripts = [[]];
  pi.knownProviders = ["anthropic"];

  await expect(
    createAgent({
      cwd: "/project",
      model: { provider: "cohere", id: "command-r", apiKey: "sk-cohere" },
    }).createSession(),
  ).rejects.toThrow("PI does not know the provider: cohere");
});

test("バックエンドが扱わないモデルを指定すると失敗する", async () => {
  scripts = [[]];
  pi.knownProviders = ["anthropic"];
  pi.knownModels = [{ provider: "anthropic", id: "claude-sonnet-4-5" }];

  await expect(
    createAgent({
      cwd: "/project",
      model: { provider: "anthropic", id: "no-such-model", apiKey: "sk-ant" },
    }).createSession(),
  ).rejects.toThrow("PI does not know the model: anthropic/no-such-model");
});

test("思考とテキストの差分を流し、最後にfinishを通知する", async () => {
  scripts = [
    [
      {
        thinkingDeltas: ["考え中"],
        deltas: ["Hello ", "world"],
        usage: { input: 5, output: 3, totalTokens: 8 },
      },
    ],
  ];
  const session = await createAgent().createSession();

  try {
    await expect(collect(session.send("Hi"))).resolves.toEqual([
      { type: "reasoning-delta", text: "考え中" },
      { type: "text-delta", text: "Hello " },
      { type: "text-delta", text: "world" },
      {
        type: "finish",
        finishReason: "stop",
        usage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 },
        text: "Hello world",
      },
    ]);
  } finally {
    await session.close();
  }

  expect(fakes.at(-1)?.prompts).toEqual(["Hi"]);
});

test("エージェントの停止理由を公開APIの終了理由に変換する", async () => {
  const reasons = [
    { stopReason: "length", expected: "length" },
    { stopReason: "toolUse", expected: "tool-calls" },
    { stopReason: "stop", expected: "stop" },
  ] as const;

  for (const { stopReason, expected } of reasons) {
    scripts = [[{ stopReason }]];
    const session = await createAgent().createSession();

    try {
      await expect(collect(session.send("Hi"))).resolves.toEqual([
        { type: "finish", finishReason: expected, usage: expect.anything(), text: "" },
      ]);
    } finally {
      await session.close();
    }
  }
});

test("ツールの開始・途中経過・結果を通知する", async () => {
  scripts = [
    [
      {
        events: [
          {
            type: "tool_execution_start",
            toolCallId: "call-1",
            toolName: "bash",
            args: { command: "ls" },
          },
          {
            type: "tool_execution_update",
            toolCallId: "call-1",
            toolName: "bash",
            args: {},
            partialResult: { content: [{ type: "text", text: "partial" }], details: {} },
          },
          {
            type: "tool_execution_end",
            toolCallId: "call-1",
            toolName: "bash",
            result: { content: [{ type: "text", text: "done" }], details: {} },
            isError: false,
            durationMs: 12,
          },
        ],
      },
    ],
  ];
  const session = await createAgent({
    cwd: "/project",
    permissionMode: "approve-all",
  }).createSession();

  try {
    await expect(collect(session.send("List the files"))).resolves.toEqual([
      { type: "tool-call", toolCallId: "call-1", toolName: "bash", kind: "execute" },
      { type: "tool-call-update", toolCallId: "call-1", text: "partial" },
      { type: "tool-result", toolCallId: "call-1", isError: false, durationMs: 12, text: "done" },
      {
        type: "finish",
        finishReason: "stop",
        usage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 },
        text: "",
      },
    ]);
  } finally {
    await session.close();
  }
});

test("ツール名を公開APIの分類に対応させる", async () => {
  const toolNames = ["read", "ls", "grep", "find", "edit", "write", "bash", "mystery"];
  scripts = [
    [
      {
        events: toolNames.map((toolName, index) => ({
          type: "tool_execution_start",
          toolCallId: `call-${index}`,
          toolName,
          args: {},
        })),
      },
    ],
  ];
  const session = await createAgent({
    cwd: "/project",
    permissionMode: "approve-all",
  }).createSession();

  try {
    const events = await collect(session.send("Do things"));
    expect(events.slice(0, toolNames.length)).toEqual([
      { type: "tool-call", toolCallId: "call-0", toolName: "read", kind: "read" },
      { type: "tool-call", toolCallId: "call-1", toolName: "ls", kind: "read" },
      { type: "tool-call", toolCallId: "call-2", toolName: "grep", kind: "search" },
      { type: "tool-call", toolCallId: "call-3", toolName: "find", kind: "search" },
      { type: "tool-call", toolCallId: "call-4", toolName: "edit", kind: "edit" },
      { type: "tool-call", toolCallId: "call-5", toolName: "write", kind: "edit" },
      { type: "tool-call", toolCallId: "call-6", toolName: "bash", kind: "execute" },
      { type: "tool-call", toolCallId: "call-7", toolName: "mystery", kind: "other" },
    ]);
  } finally {
    await session.close();
  }
});

test("失敗したターンをAgentErrorとして通知する", async () => {
  scripts = [[{ stopReason: "error", errorMessage: "model exploded" }]];
  const session = await createAgent().createSession();

  try {
    await expect(collect(session.send("Hi"))).rejects.toMatchObject({
      code: "turn-failed",
      name: AgentError.name,
      message: "model exploded",
    });
  } finally {
    await session.close();
  }
});

test("中断されたターンをAbortErrorとして通知する", async () => {
  scripts = [[{ stopReason: "aborted" }]];
  const session = await createAgent().createSession();

  try {
    await expect(collect(session.send("Hi"))).rejects.toMatchObject({ name: "AbortError" });
  } finally {
    await session.close();
  }
});

test("呼び出し元の中断シグナルでセッションを中断する", async () => {
  const controller = new AbortController();
  scripts = [[{ stopReason: "aborted" }]];
  const session = await createAgent().createSession();
  const fake = fakes.at(-1);

  try {
    await expect(
      collect(session.send("Hi", { abortSignal: controller.signal })),
    ).rejects.toMatchObject({ name: "AbortError" });
  } finally {
    await session.close();
  }

  expect(fake?.aborts).toBeGreaterThan(0);
});

test("ターンの実行中に次のターンを送ると失敗する", async () => {
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  scripts = [[{ deltas: ["partial"], hold: gate }]];
  const session = await createAgent().createSession();
  const iterator = session.send("first")[Symbol.asyncIterator]();

  try {
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { type: "text-delta", text: "partial" },
    });

    const second = session.send("second")[Symbol.asyncIterator]();
    await expect(second.next()).rejects.toMatchObject({
      code: "session-busy",
      name: AgentError.name,
    });
  } finally {
    release();
    for (let result = await iterator.next(); !result.done; result = await iterator.next()) {
      // ターンを最後まで進めてから閉じる。
    }
    await session.close();
  }
});

test("閉じたセッションへの送信は失敗し、closeでセッションを破棄する", async () => {
  scripts = [[]];
  const session = await createAgent().createSession();
  const fake = fakes.at(-1);

  await session.close();
  await session.close();

  const iterator = session.send("hello")[Symbol.asyncIterator]();
  await expect(iterator.next()).rejects.toMatchObject({
    code: "session-closed",
    name: AgentError.name,
  });
  // 破棄は1回だけ行う。
  expect(fake?.disposes).toBe(1);
});

test("coding経路はagentDirとsettingsManagerをSDK既定のままにする", async () => {
  scripts = [[]];

  await (await createAgent({ cwd: "/project" }).createSession()).close();

  // 隔離方針はチャット用プロファイル側で決める。coding側は従来通りSDK既定を使う。
  expect(pi.sessionOptions[0]).not.toHaveProperty("agentDir");
  expect(pi.sessionOptions[0]).not.toHaveProperty("settingsManager");
  expect(pi.sessionOptions[0]).not.toHaveProperty("noTools");
});

test("失敗したターンは開始前の末尾まで巻き戻す", async () => {
  scripts = [[{ deltas: ["ok"] }, { stopReason: "error", errorMessage: "boom" }]];
  const session = await createAgent().createSession();
  const fake = fakes.at(-1);

  try {
    await expect(collect(session.send("first"))).resolves.toEqual([
      { type: "text-delta", text: "ok" },
      {
        type: "finish",
        finishReason: "stop",
        usage: expect.anything(),
        text: "ok",
      },
    ]);
    // 成功時は巻き戻さない。
    expect(fake?.navigations).toEqual([]);

    await expect(collect(session.send("second"))).rejects.toMatchObject({
      code: "turn-failed",
    });
    // 2ターン目の開始前（1ターン目の応答）まで戻る。
    expect(fake?.navigations).toEqual([{ targetId: "entry-2", summarize: false }]);
    expect(fake?.leafId).toBe("entry-2");
  } finally {
    await session.close();
  }
});

test("中断したターンは開始前の末尾まで巻き戻す", async () => {
  scripts = [[{ stopReason: "aborted" }]];
  const session = await createAgent().createSession();
  const fake = fakes.at(-1);

  try {
    await expect(collect(session.send("Hi"))).rejects.toMatchObject({ name: "AbortError" });
    // 初回ターンでは自分のユーザーメッセージまで戻り、末尾は空になる。
    expect(fake?.navigations).toEqual([{ targetId: "entry-1", summarize: false }]);
    expect(fake?.leafId).toBeNull();
  } finally {
    await session.close();
  }
});

test("ターン実行中の外部シグナルで中断し、履歴に残さない", async () => {
  const controller = new AbortController();
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  scripts = [[{ deltas: ["partial"], hold: gate }]];
  const session = await createAgent().createSession();
  const fake = fakes.at(-1);

  try {
    const collected = collect(session.send("Hi", { abortSignal: controller.signal }));
    controller.abort();
    release();
    await expect(collected).rejects.toMatchObject({ name: "AbortError" });

    expect(fake?.aborts).toBeGreaterThan(0);
    expect(fake?.prompts).toEqual(["Hi"]);
    expect(fake?.navigations).toHaveLength(1);
  } finally {
    release();
    await session.close();
  }
});

test("事前に中断済みのシグナルではpromptを呼ばない", async () => {
  scripts = [[]];
  const session = await createAgent().createSession();
  const fake = fakes.at(-1);

  try {
    const iterator = session
      .send("Hi", { abortSignal: AbortSignal.abort() })
      [Symbol.asyncIterator]();
    await expect(iterator.next()).rejects.toMatchObject({ name: "AbortError" });

    expect(fake?.prompts).toEqual([]);
    expect(fake?.navigations).toEqual([]);
  } finally {
    await session.close();
  }
});

test("反復の途中終了では実行中のpromptを止めて完了を待ってから解除する", async () => {
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  scripts = [[{ deltas: ["partial"], hold: gate }, { deltas: ["next"] }]];
  const session = await createAgent().createSession();
  const fake = fakes.at(-1);
  const iterator = session.send("first")[Symbol.asyncIterator]();

  try {
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { type: "text-delta", text: "partial" },
    });

    // 途中終了の完了待ちの間は、次のターンを送ると混雑で失敗する。
    const returning = iterator.return?.();
    const second = session.send("second")[Symbol.asyncIterator]();
    await expect(second.next()).rejects.toMatchObject({
      code: "session-busy",
      name: AgentError.name,
    });

    release();
    await returning;

    // 巻き戻してあるため、次のターンは受け付けられる。
    await expect(collect(session.send("third"))).resolves.toEqual([
      { type: "text-delta", text: "next" },
      {
        type: "finish",
        finishReason: "stop",
        usage: expect.anything(),
        text: "next",
      },
    ]);
    expect(fake?.aborts).toBeGreaterThan(0);
    expect(fake?.navigations).toHaveLength(1);
  } finally {
    release();
    await session.close();
  }
});

test("実行中のcloseは進行中ターンの完了を待ってから破棄する", async () => {
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  scripts = [[{ deltas: ["partial"], hold: gate }]];
  const session = await createAgent().createSession();
  const fake = fakes.at(-1);
  const iterator = session.send("first")[Symbol.asyncIterator]();

  await expect(iterator.next()).resolves.toEqual({
    done: false,
    value: { type: "text-delta", text: "partial" },
  });

  const closing = session.close();
  release();
  await closing;

  expect(fake?.aborts).toBeGreaterThan(0);
  expect(fake?.disposes).toBe(1);
  // 中断分は巻き戻してある。
  expect(fake?.navigations).toHaveLength(1);

  await iterator.return?.();
  const second = session.send("second")[Symbol.asyncIterator]();
  await expect(second.next()).rejects.toMatchObject({
    code: "session-closed",
    name: AgentError.name,
  });
});

test("prompt自体が失敗した場合は履歴を巻き戻さずに伝える", async () => {
  scripts = [[{ reject: "no model selected" }, { deltas: ["ok"] }]];
  const session = await createAgent().createSession();
  const fake = fakes.at(-1);

  try {
    await expect(collect(session.send("Hi"))).rejects.toThrow("no model selected");
    // 履歴に足される前に終わったため、巻き戻しは行わない。
    expect(fake?.navigations).toEqual([]);

    // 次のターンは受け付けられる。
    await expect(collect(session.send("retry"))).resolves.toEqual([
      { type: "text-delta", text: "ok" },
      {
        type: "finish",
        finishReason: "stop",
        usage: expect.anything(),
        text: "ok",
      },
    ]);
  } finally {
    await session.close();
  }
});
