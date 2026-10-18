import type {
  AcpRuntime,
  AcpRuntimeEnsureInput,
  AcpRuntimeEvent,
  AcpRuntimeHandle,
  AcpRuntimeTurn,
  AcpRuntimeTurnInput,
  AcpRuntimeTurnResult,
} from "acpx/runtime";
import { expect, test } from "vite-plus/test";
import { createAcpxBackedAgent } from "../src/acpx-agent.ts";
import { AgentError } from "../src/index.ts";
import type { AgentEvent } from "../src/index.ts";

const agentOptions = { agent: "test-agent", cwd: "/project" };

interface TurnScript {
  events?: AsyncIterable<AcpRuntimeEvent>;
  result?: Promise<AcpRuntimeTurnResult>;
}

class FakeRuntime {
  readonly ensured: AcpRuntimeEnsureInput[] = [];
  readonly prompts: AcpRuntimeTurnInput[] = [];
  readonly closed: Array<{ handle: AcpRuntimeHandle; reason: string }> = [];
  readonly runtime: AcpRuntime;
  shutdowns = 0;
  sessionError: Error | undefined;

  constructor(private readonly scripts: TurnScript[] = []) {
    this.runtime = {
      ensureSession: (input) => {
        this.ensured.push(input);
        if (this.sessionError) {
          return Promise.reject(this.sessionError);
        }
        return Promise.resolve(makeHandle(input.sessionKey));
      },
      startTurn: (input) => {
        this.prompts.push(input);
        return makeTurn(input, this.scripts.shift() ?? {});
      },
      runTurn: (input) => {
        this.prompts.push(input);
        return makeTurn(input, this.scripts.shift() ?? {}).events;
      },
      cancel: () => Promise.resolve(),
      close: (input) => {
        this.closed.push(input);
        return Promise.resolve();
      },
      shutdown: () => {
        this.shutdowns += 1;
        return Promise.resolve();
      },
    };
  }

  createAgent() {
    return createAcpxBackedAgent(() => this.runtime, agentOptions);
  }
}

function makeHandle(sessionKey: string): AcpRuntimeHandle {
  return { sessionKey, backend: "acpx", runtimeSessionName: sessionKey };
}

function makeTurn(input: AcpRuntimeTurnInput, script: TurnScript): AcpRuntimeTurn {
  return {
    requestId: input.requestId,
    promptStarted: Promise.resolve(),
    events: script.events ?? emptyEvents(),
    result: script.result ?? Promise.resolve({ status: "completed", stopReason: "end_turn" }),
    cancel: () => Promise.resolve(),
    closeStream: () => Promise.resolve(),
  };
}

async function* emptyEvents(): AsyncGenerator<AcpRuntimeEvent> {
  // イベントを流さないターン。
}

async function* parts(...events: readonly AcpRuntimeEvent[]): AsyncGenerator<AcpRuntimeEvent> {
  for (const event of events) {
    yield event;
  }
}

async function collect(events: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const collected: AgentEvent[] = [];
  for await (const event of events) {
    collected.push(event);
  }
  return collected;
}

test("テキスト差分を流し、最後にfinishを通知する", async () => {
  const fake = new FakeRuntime([
    {
      events: parts({ type: "text_delta", text: "Hello " }, { type: "text_delta", text: "world" }),
    },
  ]);
  const session = await fake.createAgent().createSession();

  try {
    await expect(collect(session.send("Hi"))).resolves.toEqual([
      { type: "text-delta", text: "Hello " },
      { type: "text-delta", text: "world" },
      { type: "finish", finishReason: "stop", usage: {}, text: "Hello world" },
    ]);
  } finally {
    await session.close();
  }

  expect(fake.prompts).toHaveLength(1);
  expect(fake.prompts[0]?.text).toBe("Hi");
  expect(fake.prompts[0]?.mode).toBe("prompt");
});

test("思考の差分も流し、statusイベントからusageを引き出す", async () => {
  const fake = new FakeRuntime([
    {
      events: parts(
        { type: "text_delta", text: "thinking...", stream: "thought" },
        { type: "text_delta", text: "answer" },
        {
          type: "status",
          text: "usage",
          breakdown: { inputTokens: 5, outputTokens: 3, totalTokens: 8 },
        },
      ),
    },
  ]);
  const session = await fake.createAgent().createSession();

  try {
    await expect(collect(session.send("Hi"))).resolves.toEqual([
      { type: "reasoning-delta", text: "thinking..." },
      { type: "text-delta", text: "answer" },
      {
        type: "finish",
        finishReason: "stop",
        usage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 },
        text: "answer",
      },
    ]);
  } finally {
    await session.close();
  }
});

test("ツールの開始・途中経過・結果を通知し、終端後の重複は無視する", async () => {
  const fake = new FakeRuntime([
    {
      events: parts(
        {
          type: "tool_call",
          text: "",
          toolCallId: "t1",
          status: "pending",
          title: "Read src/index.ts",
          kind: "read",
        },
        {
          type: "tool_call",
          text: "",
          toolCallId: "t1",
          status: "in_progress",
          content: [{ type: "content", content: { type: "text", text: "partial" } }],
        },
        {
          type: "tool_call",
          text: "",
          toolCallId: "t1",
          status: "completed",
          content: [{ type: "content", content: { type: "text", text: "done" } }],
        },
        // 終端のあとに届いた重複は無視する。
        { type: "tool_call", text: "", toolCallId: "t1", status: "completed" },
      ),
    },
  ]);
  const session = await fake.createAgent().createSession();

  try {
    await expect(collect(session.send("Read it"))).resolves.toEqual([
      { type: "tool-call", toolCallId: "t1", title: "Read src/index.ts", kind: "read" },
      { type: "tool-call-update", toolCallId: "t1", text: "partial" },
      { type: "tool-result", toolCallId: "t1", isError: false, text: "done" },
      { type: "finish", finishReason: "stop", usage: {}, text: "" },
    ]);
  } finally {
    await session.close();
  }
});

test("失敗したツールはisErrorとして通知し、diffは場所だけを示す", async () => {
  const fake = new FakeRuntime([
    {
      events: parts({
        type: "tool_call",
        text: "",
        toolCallId: "t1",
        status: "failed",
        kind: "edit",
        content: [{ type: "diff", path: "src/a.ts", oldText: "a", newText: "b" }],
      }),
    },
  ]);
  const session = await fake.createAgent().createSession();

  try {
    await expect(collect(session.send("Edit it"))).resolves.toEqual([
      { type: "tool-call", toolCallId: "t1", kind: "edit" },
      { type: "tool-result", toolCallId: "t1", isError: true, text: "[diff] src/a.ts" },
      { type: "finish", finishReason: "stop", usage: {}, text: "" },
    ]);
  } finally {
    await session.close();
  }
});

test("エージェントの停止理由を公開APIの終了理由に変換する", async () => {
  const reasons = [
    { stopReason: "max_tokens", expected: "length" },
    { stopReason: "refusal", expected: "content-filter" },
    { stopReason: "max_turn_requests", expected: "other" },
    { stopReason: undefined, expected: "stop" },
  ] as const;

  for (const { stopReason, expected } of reasons) {
    const result: AcpRuntimeTurnResult =
      stopReason === undefined ? { status: "completed" } : { status: "completed", stopReason };
    const fake = new FakeRuntime([{ result: Promise.resolve(result) }]);
    const session = await fake.createAgent().createSession();

    try {
      const events = await collect(session.send("Hi"));
      expect(events).toEqual([{ type: "finish", finishReason: expected, usage: {}, text: "" }]);
    } finally {
      await session.close();
    }
  }
});

test("ターンをまたいで同じacpxセッションを使い続ける", async () => {
  const fake = new FakeRuntime([
    { events: parts({ type: "text_delta", text: "first" }) },
    { events: parts({ type: "text_delta", text: "second" }) },
  ]);
  const session = await fake.createAgent().createSession();

  try {
    await collect(session.send("one"));
    await collect(session.send("two"));
  } finally {
    await session.close();
  }

  expect(fake.prompts.map((prompt) => prompt.text)).toEqual(["one", "two"]);
  expect(fake.prompts[0]?.handle).toBe(fake.prompts[1]?.handle);
});

test("エージェントの指示とセッションの指示をシステムプロンプトとして渡す", async () => {
  const fake = new FakeRuntime();
  const agent = createAcpxBackedAgent(() => fake.runtime, {
    ...agentOptions,
    instructions: "be brief",
  });

  await (await agent.createSession()).close();
  await (await agent.createSession({ instructions: "be thorough" })).close();

  expect(fake.ensured.map((input) => input.sessionOptions?.systemPrompt)).toEqual([
    "be brief",
    "be thorough",
  ]);
});

test("エージェントのモデルをセッションのモデルで上書きする", async () => {
  const fake = new FakeRuntime();
  const agent = createAcpxBackedAgent(() => fake.runtime, { ...agentOptions, model: "gpt-5.4" });

  await (await agent.createSession()).close();
  await (await agent.createSession({ model: "gpt-5.4-mini" })).close();

  expect(fake.ensured.map((input) => input.sessionOptions?.model)).toEqual([
    "gpt-5.4",
    "gpt-5.4-mini",
  ]);
});

test("指示もモデルも指定しない場合はセッションの設定を渡さない", async () => {
  const fake = new FakeRuntime();
  const agent = createAcpxBackedAgent(() => fake.runtime, agentOptions);

  await (await agent.createSession()).close();

  expect(fake.ensured[0]?.sessionOptions).toBeUndefined();
});

test("createSessionごとにランタイムと別々のセッションを生成する", async () => {
  const fakes: FakeRuntime[] = [];
  const agent = createAcpxBackedAgent(
    () => {
      const fake = new FakeRuntime();
      fakes.push(fake);
      return fake.runtime;
    },
    { agent: "test-agent", cwd: "/project" },
  );

  await (await agent.createSession()).close();
  await (await agent.createSession()).close();

  expect(fakes).toHaveLength(2);
  const keys = fakes.map((fake) => fake.ensured[0]?.sessionKey);
  expect(keys[0]).toBeDefined();
  expect(keys[0]).not.toBe(keys[1]);
  expect(fakes.map((fake) => fake.ensured[0]?.mode)).toEqual(["persistent", "persistent"]);
});

test("失敗したターンをAgentErrorとして通知する", async () => {
  const fake = new FakeRuntime([
    {
      result: Promise.resolve({
        status: "failed",
        error: { message: "agent exploded", code: "ACP_TURN_FAILED" },
      }),
    },
  ]);
  const session = await fake.createAgent().createSession();

  try {
    await expect(collect(session.send("Hi"))).rejects.toMatchObject({
      code: "turn-failed",
      name: AgentError.name,
      message: "agent exploded",
    });
  } finally {
    await session.close();
  }
});

test("キャンセルされたターンをAbortErrorとして通知する", async () => {
  const fake = new FakeRuntime([
    { result: Promise.resolve({ status: "cancelled", stopReason: "cancelled" }) },
  ]);
  const session = await fake.createAgent().createSession();

  try {
    await expect(collect(session.send("Hi"))).rejects.toMatchObject({ name: "AbortError" });
  } finally {
    await session.close();
  }
});

test("呼び出し元の中断シグナルをランタイムに伝える", async () => {
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const fake = new FakeRuntime([
    {
      events: (async function* () {
        yield { type: "text_delta", text: "partial" } as AcpRuntimeEvent;
        await gate;
      })(),
      result: gate.then((): AcpRuntimeTurnResult => ({
        status: "completed",
        stopReason: "end_turn",
      })),
    },
  ]);
  const session = await fake.createAgent().createSession();
  const controller = new AbortController();
  const iterator = session.send("Hi", { abortSignal: controller.signal })[Symbol.asyncIterator]();

  try {
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { type: "text-delta", text: "partial" },
    });
    expect(fake.prompts[0]?.signal?.aborted).toBe(false);

    controller.abort();
    expect(fake.prompts[0]?.signal?.aborted).toBe(true);
  } finally {
    release();
    for (let result = await iterator.next(); !result.done; result = await iterator.next()) {
      // ターンを最後まで進めてから閉じる。
    }
    await session.close();
  }
});

test("ターンの実行中に次のターンを送ると失敗する", async () => {
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const fake = new FakeRuntime([
    {
      events: (async function* () {
        yield { type: "text_delta", text: "partial" } as AcpRuntimeEvent;
        await gate;
      })(),
      result: gate.then((): AcpRuntimeTurnResult => ({
        status: "completed",
        stopReason: "end_turn",
      })),
    },
  ]);
  const session = await fake.createAgent().createSession();
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
      // 最初のターンを流し切る。
    }
    await session.close();
  }
});

test("closeはセッションを閉じてランタイムを破棄し、複数回呼んでも安全", async () => {
  const fake = new FakeRuntime();
  const session = await fake.createAgent().createSession();

  await session.close();
  await session.close();

  expect(fake.closed).toHaveLength(1);
  expect(fake.closed[0]?.handle.sessionKey).toBe(fake.ensured[0]?.sessionKey);
  expect(fake.shutdowns).toBe(1);

  await expect(collect(session.send("hello"))).rejects.toMatchObject({
    code: "session-closed",
    name: AgentError.name,
  });
});

test("セッションの生成に失敗するとランタイムを破棄する", async () => {
  const fake = new FakeRuntime();
  fake.sessionError = new Error("agent is not installed");

  await expect(fake.createAgent().createSession()).rejects.toThrow("agent is not installed");
  expect(fake.shutdowns).toBe(1);
});
