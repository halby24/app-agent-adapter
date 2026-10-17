import { expect, test } from "vite-plus/test";
import { findAgentOption, listAgentOptions, toAgentChoice } from "../src/index.ts";

test("選択肢から種類とIDだけを取り出す", () => {
  const option = findAgentOption("openai");
  if (option === undefined) {
    throw new Error("一覧にopenaiがない");
  }

  const choice = toAgentChoice(option);

  // 表示名や必要なパッケージは選択に含めない。
  expect(choice).toEqual({ kind: "provider", id: "openai" });
  expect(Object.keys(choice).sort()).toEqual(["id", "kind"]);
});

test("ハーネスの選択肢からも種類とIDだけを取り出す", () => {
  const option = findAgentOption("claude");
  if (option === undefined) {
    throw new Error("一覧にclaudeがない");
  }

  expect(toAgentChoice(option)).toEqual({ kind: "harness", id: "claude" });
});

test("どの選択肢から取り出しても、元の種類とIDを保つ", () => {
  for (const option of listAgentOptions()) {
    const choice = toAgentChoice(option);

    expect(choice.kind).toBe(option.kind);
    expect(choice.id).toBe(option.id);
  }
});
