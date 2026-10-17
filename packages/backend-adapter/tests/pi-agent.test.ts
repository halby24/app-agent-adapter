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
  usage?: { input: number; output: number; totalTokens: number };
  stopReason?: string;
  errorMessage?: string;
  hold?: Promise<void>;
}

class FakePiSession {
  readonly messages: unknown[] = [];
  readonly prompts: string[] = [];
  readonly unsubscribed: number[] = [];
  aborts = 0;
  disposes = 0;
  #listeners: Array<(event: AgentSessionEvent) => void> = [];

  constructor(private readonly scripts: TurnScript[]) {}

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
    for (const delta of script.thinkingDeltas ?? []) {
      this.#emit({
        type: "message_update",
        assistantMessageEvent: { type: "thinking_delta", delta },
      });
    }
    for (const delta of script.deltas ?? []) {
      this.#emit({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta } });
    }
    if (script.hold !== undefined) {
      await script.hold;
    }
    this.messages.push({
      role: "assistant",
      usage: script.usage ?? { input: 5, output: 3, totalTokens: 8 },
      stopReason: script.stopReason ?? "stop",
      errorMessage: script.errorMessage,
    });
  }

  abort(): Promise<void> {
    this.aborts += 1;
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
    // 操作をすべて許す場合は、書き込みとコマンド実行のツールも渡す。
    tools: ["read", "bash", "edit", "write"],
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

test("テキスト差分を流し、最後にfinishを通知する", async () => {
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

test("エージェントの停止理由をAI SDKの終了理由に変換する", async () => {
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
