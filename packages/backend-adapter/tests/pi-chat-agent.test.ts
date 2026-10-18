import { access } from "node:fs/promises";
import type { AgentSessionEvent, AgentSession as PiSession } from "@earendil-works/pi-coding-agent";
import { beforeEach, expect, test, vi } from "vite-plus/test";
import { createPiChatAgent } from "../src/pi-chat-agent.ts";
import { AgentError } from "../src/index.ts";
import type { AgentEvent } from "../src/index.ts";

const pi = vi.hoisted(() => ({
  sessionOptions: [] as unknown[],
  resourceLoaderOptions: [] as unknown[],
  settingsInputs: [] as unknown[],
  inMemoryCwd: [] as Array<string | undefined>,
  runtimeApiKeys: [] as Array<{ provider: string; apiKey: string }>,
  knownProviders: [] as string[],
  knownModels: [] as Array<{ provider: string; id: string }>,
}));

/** チャット用の中立指示（実装と文言を一致させる）。 */
const NEUTRAL_INSTRUCTIONS =
  "You are a helpful chat assistant. Answer concisely in the user's language.";

class FakePiSession {
  readonly messages: unknown[] = [];
  readonly prompts: string[] = [];
  aborts = 0;
  disposes = 0;
  #listeners: Array<(event: AgentSessionEvent) => void> = [];

  constructor(private readonly stopReason = "stop") {}

  readonly sessionManager = {
    getLeafId: (): string | null => null,
    getBranch: (): unknown[] => [],
  };

  subscribe(listener: (event: AgentSessionEvent) => void): () => void {
    this.#listeners.push(listener);
    return () => {
      this.#listeners = this.#listeners.filter((entry) => entry !== listener);
    };
  }

  async prompt(text: string): Promise<void> {
    this.prompts.push(text);
    for (const listener of this.#listeners) {
      listener({
        type: "message_update",
        assistantMessageEvent: { type: "text_delta", delta: "hi" },
      } as AgentSessionEvent);
    }
    const failed = text.startsWith("fail:");
    this.messages.push({
      role: "assistant",
      usage: { input: 1, output: 1, totalTokens: 2 },
      stopReason: failed ? "error" : this.stopReason,
      errorMessage: failed ? "boom" : undefined,
    });
  }

  async navigateTree(): Promise<unknown> {
    return { cancelled: false };
  }

  abort(): Promise<void> {
    this.aborts += 1;
    return Promise.resolve();
  }

  dispose(): void {
    this.disposes += 1;
  }
}

const fakes: FakePiSession[] = [];

vi.mock("@earendil-works/pi-coding-agent", () => ({
  createAgentSession: (options: unknown) => {
    pi.sessionOptions.push(options);
    const session = new FakePiSession();
    fakes.push(session);
    return Promise.resolve({ session: session as unknown as PiSession });
  },
  SessionManager: {
    inMemory: (cwd?: string) => {
      pi.inMemoryCwd.push(cwd);
      return { kind: "in-memory" };
    },
  },
  SettingsManager: {
    inMemory: (settings?: unknown) => {
      pi.settingsInputs.push(settings);
      return { kind: "in-memory-settings" };
    },
  },
  DefaultResourceLoader: class {
    readonly #options: Record<string, unknown>;

    constructor(options: Record<string, unknown>) {
      this.#options = options;
      pi.resourceLoaderOptions.push(options);
    }

    reload(): Promise<void> {
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

beforeEach(() => {
  fakes.length = 0;
  pi.sessionOptions.length = 0;
  pi.resourceLoaderOptions.length = 0;
  pi.settingsInputs.length = 0;
  pi.inMemoryCwd.length = 0;
  pi.runtimeApiKeys.length = 0;
  pi.knownProviders = [];
  pi.knownModels = [];
});

function loaderOf(index: number): {
  systemPrompt(): string | undefined;
  appendedSystemPrompts(): string[];
} {
  const loader = (pi.sessionOptions[index] as { resourceLoader: unknown }).resourceLoader as {
    systemPrompt(): string | undefined;
    appendedSystemPrompts(): string[];
  };
  return loader;
}

async function collect(events: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const collected: AgentEvent[] = [];
  for await (const event of events) {
    collected.push(event);
  }
  return collected;
}

test("未指定と空文字では中立指示を使い、指定があればそれを使う", async () => {
  const agent = createPiChatAgent({ cwd: "/project" });
  await (await agent.createSession()).close();
  await (await agent.createSession({ instructions: "" })).close();
  await (await agent.createSession({ instructions: "be brief" })).close();

  expect([
    loaderOf(0).systemPrompt(),
    loaderOf(1).systemPrompt(),
    loaderOf(2).systemPrompt(),
  ]).toEqual([NEUTRAL_INSTRUCTIONS, NEUTRAL_INSTRUCTIONS, "be brief"]);
  // 置き換える場合は、PIが既定で足す追加指示を足さない。
  expect(loaderOf(0).appendedSystemPrompts()).toEqual([]);
});

test("チャット用にツールなしと隔離の5点セットを指定する", async () => {
  await (await createPiChatAgent({ cwd: "/project" }).createSession()).close();

  // ツールは使わない。
  expect(pi.sessionOptions[0]).toMatchObject({ cwd: "/project", noTools: "all" });
  expect(pi.sessionOptions[0]).not.toHaveProperty("tools");
  // 会話履歴と動作設定はメモリに閉じる。
  expect(pi.sessionOptions[0]).toMatchObject({
    sessionManager: { kind: "in-memory" },
    settingsManager: { kind: "in-memory-settings" },
  });
  expect(pi.inMemoryCwd).toEqual(["/project"]);
  expect(pi.settingsInputs).toEqual([
    { cacheWarming: "off", compaction: { enabled: false }, retry: { enabled: false } },
  ]);
  // 技能・文書・拡張・配色は読み込まない。
  expect(pi.resourceLoaderOptions[0]).toMatchObject({
    cwd: "/project",
    noSkills: true,
    noPromptTemplates: true,
    noContextFiles: true,
    noExtensions: true,
    noThemes: true,
  });
});

test("利用者のagentDirを読まず、セッションごとに一時dirを使ってcloseで破棄する", async () => {
  const session = await createPiChatAgent({ cwd: "/project" }).createSession();
  const agentDir = (pi.sessionOptions[0] as { agentDir: string }).agentDir;
  const loaderAgentDir = (pi.resourceLoaderOptions[0] as { agentDir: string }).agentDir;

  expect(typeof agentDir).toBe("string");
  expect(agentDir).not.toBe("/agent-dir");
  expect(loaderAgentDir).toBe(agentDir);
  await expect(access(agentDir)).resolves.toBeUndefined();

  await session.close();

  await expect(access(agentDir)).rejects.toThrow();
  expect(fakes.at(-1)?.disposes).toBe(1);
});

test("モデルを指定すると実行時のAPIキーで解決してセッションに渡す", async () => {
  pi.knownProviders = ["anthropic"];
  pi.knownModels = [{ provider: "anthropic", id: "claude-sonnet-4-5" }];

  const session = await createPiChatAgent({
    cwd: "/project",
    model: { provider: "anthropic", id: "claude-sonnet-4-5", apiKey: "sk-ant" },
  }).createSession();

  try {
    await expect(collect(session.send("Hi"))).resolves.toEqual([
      { type: "text-delta", text: "hi" },
      {
        type: "finish",
        finishReason: "stop",
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        text: "hi",
      },
    ]);
  } finally {
    await session.close();
  }

  expect(pi.runtimeApiKeys).toEqual([{ provider: "anthropic", apiKey: "sk-ant" }]);
  expect(pi.sessionOptions[0]).toMatchObject({
    model: { id: "claude-sonnet-4-5", provider: "anthropic" },
  });
});

test("失敗したターンはAgentErrorとして通知する", async () => {
  const session = await createPiChatAgent({ cwd: "/project" }).createSession();

  try {
    await expect(collect(session.send("fail: boom"))).rejects.toMatchObject({
      code: "turn-failed",
      name: AgentError.name,
      message: "boom",
    });
  } finally {
    await session.close();
  }
});

test("閉じたセッションへの送信は失敗する", async () => {
  const session = await createPiChatAgent({ cwd: "/project" }).createSession();

  await session.close();

  const iterator = session.send("hello")[Symbol.asyncIterator]();
  await expect(iterator.next()).rejects.toMatchObject({
    code: "session-closed",
    name: AgentError.name,
  });
});
