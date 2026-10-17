import { expect, test, vi } from "vite-plus/test";
import { createCodingAgent } from "../src/index.ts";

const backend = vi.hoisted(() => ({
  acpxAgentOptions: [] as unknown[],
}));

vi.mock("backend-adapter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("backend-adapter")>();
  return {
    ...actual,
    createAcpxAgent: (options: unknown) => {
      backend.acpxAgentOptions.push(options);
      return {
        createSession: () =>
          Promise.resolve({
            send: () => (async function* () {})(),
            close: () => Promise.resolve(),
          }),
      };
    },
  };
});

test("ハーネスを選ぶと、作業ディレクトリと権限を指定してエージェントを生成する", () => {
  createCodingAgent({
    kind: "harness",
    id: "claude",
    cwd: "/project",
    model: "gpt-5.4",
    instructions: "リポジトリを調査する",
    permissionMode: "approve-reads",
  });

  expect(backend.acpxAgentOptions).toEqual([
    {
      agent: "claude",
      cwd: "/project",
      model: "gpt-5.4",
      instructions: "リポジトリを調査する",
      permissionMode: "approve-reads",
    },
  ]);
});
