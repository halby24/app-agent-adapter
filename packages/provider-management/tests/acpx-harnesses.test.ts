import type { AcpAgentInspection } from "acpx/agent-registry";
import { expect, test, vi } from "vite-plus/test";
import { listAcpxHarnesses } from "../src/acpx-harnesses.ts";
import { listAgentOptions } from "../src/index.ts";

const acpx = vi.hoisted(() => ({
  inspected: [] as string[],
  inspections: new Map<string, unknown>(),
}));

vi.mock("acpx/agent-registry", () => ({
  createAgentRegistry: () => ({
    inspect: (id: string): AcpAgentInspection | undefined => {
      acpx.inspected.push(id);
      return acpx.inspections.get(id) as AcpAgentInspection | undefined;
    },
  }),
}));

function installed(id: string, name: string): AcpAgentInspection {
  return { id, name, launch: { kind: "installed", argv: [id, "acp"] } };
}

function missing(id: string, name: string): AcpAgentInspection {
  return { id, name, launch: { kind: "missing", requirements: [{ kind: "command", name: id }] } };
}

test("実行に必要なものが見つかったハーネスはinstalledとして検出する", () => {
  acpx.inspections.set("claude", installed("claude", "Claude Code"));

  const harness = listAcpxHarnesses().find((entry) => entry.id === "claude");

  expect(harness).toEqual({ id: "claude", name: "Claude Code", status: "installed" });
});

test("実行に必要なものが見つからないハーネスはmissingとして検出する", () => {
  acpx.inspections.set("gemini", missing("gemini", "Gemini CLI"));

  const harness = listAcpxHarnesses().find((entry) => entry.id === "gemini");

  expect(harness).toEqual({ id: "gemini", name: "Gemini CLI", status: "missing" });
});

test("acpxが検出しないハーネスはunknownとして検出する", () => {
  acpx.inspections.set("mux", undefined);

  const harness = listAcpxHarnesses().find((entry) => entry.id === "mux");

  // 表示名も分からないため、IDをそのまま名前として使う。
  expect(harness).toEqual({ id: "mux", name: "mux", status: "unknown" });
});

test("一覧にあるすべてのハーネスを検出する", () => {
  acpx.inspected.length = 0;

  listAcpxHarnesses();

  const harnessIds = listAgentOptions()
    .filter((option) => option.kind === "harness")
    .map((option) => option.id);
  expect(new Set(acpx.inspected)).toEqual(new Set(harnessIds));
});
