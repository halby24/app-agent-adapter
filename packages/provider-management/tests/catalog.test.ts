import { expect, test } from "vite-plus/test";
import { findAgentOption, listAgentOptions } from "../src/index.ts";

test("一覧はプロバイダとハーネスの両方を含む", () => {
  const kinds = new Set(listAgentOptions().map((option) => option.kind));

  expect([...kinds].sort()).toEqual(["harness", "provider"]);
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
