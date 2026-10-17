import { expect, test } from "vite-plus/test";
import { toToolText } from "../src/stream-parts.ts";

test("ACPのcontentブロックからテキストを取り出す", () => {
  expect(toToolText([{ type: "content", content: { type: "text", text: "hello" } }])).toBe("hello");
});

test("PIの結果からテキストを取り出し、画像は場所だけを示す", () => {
  expect(
    toToolText({
      content: [
        { type: "text", text: "a" },
        { type: "image", data: "..." },
      ],
      details: {},
    }),
  ).toBe("a\n[image]");
});

test("diffとterminalは内容を展開せず、種類だけを示す", () => {
  expect(toToolText([{ type: "diff", path: "src/a.ts", oldText: "a", newText: "b" }])).toBe(
    "[diff] src/a.ts",
  );
  expect(toToolText([{ type: "terminal", terminalId: "t1" }])).toBe("[terminal]");
});

test("文字列はそのまま扱う", () => {
  expect(toToolText("output")).toBe("output");
});

test("テキストを取り出せない場合はundefinedを返す", () => {
  expect(toToolText(undefined)).toBeUndefined();
  expect(toToolText([])).toBeUndefined();
  expect(toToolText({ content: [] })).toBeUndefined();
  expect(toToolText({ raw: "payload" })).toBeUndefined();
});

test("長い内容は切り詰める", () => {
  const text = toToolText(`${"x".repeat(5000)}tail`);

  expect(text).toHaveLength(4001);
  expect(text?.endsWith("…")).toBe(true);
});
