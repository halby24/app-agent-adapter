import { streamText } from "ai";
import type { LanguageModel, ModelMessage } from "ai";
import { AgentError } from "./errors.ts";
import type { AgentEvent, AgentSession, SendOptions } from "./types.ts";

/**
 * AI SDKの言語モデルを直接呼び出すセッション。
 *
 * @internal
 */
export class ModelAgentSession implements AgentSession {
  readonly #model: LanguageModel;
  readonly #instructions: string | undefined;
  readonly #messages: ModelMessage[] = [];
  #active = false;
  #closed = false;
  #abortController: AbortController | undefined;

  constructor(model: LanguageModel, instructions: string | undefined) {
    this.#model = model;
    this.#instructions = instructions;
  }

  send(input: string, options?: SendOptions): AsyncIterable<AgentEvent> {
    return this.#runTurn(input, options);
  }

  async close(): Promise<void> {
    this.#closed = true;
    this.#abortController?.abort();
  }

  async *#runTurn(input: string, options?: SendOptions): AsyncGenerator<AgentEvent, void, void> {
    if (this.#closed) {
      throw new AgentError("session-closed", "Cannot send a turn to a closed session.");
    }
    if (this.#active) {
      throw new AgentError("session-busy", "The session is still processing the previous turn.");
    }

    this.#active = true;
    const abortController = new AbortController();
    this.#abortController = abortController;

    const externalSignal = options?.abortSignal;
    const onAbort = () => abortController.abort(externalSignal?.reason);
    if (externalSignal?.aborted) {
      abortController.abort(externalSignal.reason);
    } else {
      externalSignal?.addEventListener("abort", onAbort, { once: true });
    }

    const userMessage: ModelMessage = { role: "user", content: input };
    let completed = false;
    let text = "";

    try {
      const result = streamText({
        model: this.#model,
        ...(this.#instructions === undefined ? {} : { instructions: this.#instructions }),
        messages: [...this.#messages, userMessage],
        abortSignal: abortController.signal,
      });

      for await (const delta of result.textStream) {
        text += delta;
        yield { type: "text-delta", text: delta };
      }

      const finishReason = await result.finishReason;
      const usage = await result.usage;

      this.#messages.push(userMessage, { role: "assistant", content: text });
      completed = true;

      yield { type: "finish", finishReason, usage, text };
    } finally {
      if (!completed) {
        abortController.abort();
      }
      externalSignal?.removeEventListener("abort", onAbort);
      this.#abortController = undefined;
      this.#active = false;
    }
  }
}
