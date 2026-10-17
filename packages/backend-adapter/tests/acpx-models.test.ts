import { resolveAgentArgv } from "acpx/agent-registry";
import type { AcpRuntimeSessionModels, InspectAgentModelsOptions } from "acpx/runtime";
import { beforeEach, expect, test, vi } from "vite-plus/test";
import { listAcpxModels } from "../src/acpx-models.ts";

const acpx = vi.hoisted(() => ({
  inspectAgentModels:
    vi.fn<(options: InspectAgentModelsOptions) => Promise<AcpRuntimeSessionModels | undefined>>(),
}));

vi.mock("acpx/runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("acpx/runtime")>();
  return { ...actual, inspectAgentModels: acpx.inspectAgentModels };
});

beforeEach(() => {
  acpx.inspectAgentModels.mockReset();
});

test("組み込み名を起動用のargvに解決してエージェントを起動する", async () => {
  acpx.inspectAgentModels.mockResolvedValue(undefined);

  await listAcpxModels({ agent: "claude", cwd: "/project" });

  expect(acpx.inspectAgentModels).toHaveBeenCalledWith({
    agentCommand: resolveAgentArgv("claude"),
    cwd: "/project",
  });
});

test("エージェントが通知したモデルの一覧を返す", async () => {
  acpx.inspectAgentModels.mockResolvedValue({
    currentModelId: "gpt-5.4",
    availableModelIds: ["gpt-5.4", "gpt-5.4-mini"],
    availableModels: [
      { modelId: "gpt-5.4", name: "GPT-5.4" },
      { modelId: "gpt-5.4-mini", name: "GPT-5.4 mini" },
    ],
  });

  await expect(listAcpxModels({ agent: "codex", cwd: "/project" })).resolves.toEqual([
    { id: "gpt-5.4", name: "GPT-5.4" },
    { id: "gpt-5.4-mini", name: "GPT-5.4 mini" },
  ]);
});

test("表示名を通知しない場合はIDだけを返す", async () => {
  acpx.inspectAgentModels.mockResolvedValue({
    availableModelIds: ["model-a", "model-b"],
  });

  await expect(listAcpxModels({ agent: "codex", cwd: "/project" })).resolves.toEqual([
    { id: "model-a" },
    { id: "model-b" },
  ]);
});

test("モデルを通知しないエージェントでは空の一覧を返す", async () => {
  acpx.inspectAgentModels.mockResolvedValue(undefined);

  await expect(listAcpxModels({ agent: "codex", cwd: "/project" })).resolves.toEqual([]);
});

test("組み込み名以外のエージェントでは調査せずに失敗する", async () => {
  await expect(listAcpxModels({ agent: "my-acp-server --stdio", cwd: "/project" })).rejects.toThrow(
    "Cannot list models of an agent that has no known argv",
  );

  expect(acpx.inspectAgentModels).not.toHaveBeenCalled();
});
