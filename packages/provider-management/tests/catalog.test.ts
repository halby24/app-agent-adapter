import { createAgentRegistry } from "acpx/agent-registry";
import { expect, test } from "vite-plus/test";
import { findAgentOption, listAgentOptions } from "../src/index.ts";

test("一覧はプロバイダとハーネスの両方を含む", () => {
  const kinds = new Set(listAgentOptions().map((option) => option.kind));

  expect([...kinds].sort()).toEqual(["harness", "provider"]);
});

test("一覧のハーネスはacpxの組み込みエージェント名と一致する", () => {
  // ハーネスのIDはacpxの組み込み名をそのまま使うため、acpx側の追加・改名で
  // 一覧が古くなる。ここで不一致を検出して、一覧の見直しを促す。
  const harnessIds = listAgentOptions()
    .filter((option) => option.kind === "harness")
    .map((option) => option.id)
    .sort();

  expect(harnessIds).toEqual([...createAgentRegistry().list()].sort());
});

test("IDは種類をまたいで一意で、IDから選択肢を引き当てられる", () => {
  const options = listAgentOptions();
  const ids = options.map((option) => option.id);

  expect(new Set(ids).size).toBe(ids.length);
  for (const option of options) {
    expect(findAgentOption(option.id)).toBe(option);
  }
});

test("一覧にないIDは見つからない", () => {
  expect(findAgentOption("no-such-backend")).toBeUndefined();
});
