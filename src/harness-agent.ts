import type { FinishReason } from "ai";
import { AgentError } from "./errors.ts";
import { isFinishReason, isRecord, toAgentUsage } from "./stream-parts.ts";
import type {
  Agent,
  AgentEvent,
  AgentSession,
  AgentUsage,
  HarnessAgentLike,
  HarnessAgentOptions,
  HarnessSandboxSession,
  HarnessSessionLike,
  SendOptions,
  SessionOptions,
} from "./types.ts";

/**
 * HarnessAgentを公開APIのエージェントとして扱う。
 *
 * @param options - 使用するHarnessAgentと、セッションごとのsandbox生成処理。
 * @returns セッションを生成できるエージェント。
 * @throws `AgentError` — セッション固有の指示を渡した場合（`option-unsupported`）。
 * @remarks
 * セッションの生成時にsandboxを1つ生成し、{@link AgentSession.close}でHarnessAgentの
 * セッションとsandboxの両方を破棄する。
 * ツール承認など、アダプタが扱わない入力待ちでターンが終了した場合は
 * `AgentError`（`turn-unfinished`）を投げる。
 */
export function createHarnessAgent<TSession extends HarnessSessionLike>(
  options: HarnessAgentOptions<TSession>,
): Agent {
  return {
    async createSession(sessionOptions?: SessionOptions): Promise<AgentSession> {
      if (sessionOptions?.instructions !== undefined) {
        throw new AgentError(
          "option-unsupported",
          "Harness-backed sessions do not support session-level instructions. Configure instructions on the HarnessAgent instead.",
        );
      }

      const sandboxSession = await options.createSandboxSession();

      let session: TSession;
      try {
        session = await options.harnessAgent.createSession({ sandboxSession });
      } catch (error) {
        await destroySandboxIgnoringErrors(sandboxSession);
        throw error;
      }

      return new HarnessBackedAgentSession(options.harnessAgent, session, sandboxSession);
    },
  };
}

/**
 * HarnessAgentのセッションを公開APIのセッションとして扱う。
 *
 * @internal
 */
class HarnessBackedAgentSession<TSession extends HarnessSessionLike> implements AgentSession {
  readonly #harnessAgent: HarnessAgentLike<TSession>;
  readonly #session: TSession;
  readonly #sandboxSession: HarnessSandboxSession;
  #active = false;
  #closed = false;
  #abortController: AbortController | undefined;
  #closing: Promise<void> | undefined;

  constructor(
    harnessAgent: HarnessAgentLike<TSession>,
    session: TSession,
    sandboxSession: HarnessSandboxSession,
  ) {
    this.#harnessAgent = harnessAgent;
    this.#session = session;
    this.#sandboxSession = sandboxSession;
  }

  send(input: string, options?: SendOptions): AsyncIterable<AgentEvent> {
    return this.#runTurn(input, options);
  }

  close(): Promise<void> {
    this.#closed = true;
    this.#abortController?.abort();
    this.#closing ??= this.#close();
    return this.#closing;
  }

  async #close(): Promise<void> {
    try {
      await this.#session.destroy();
    } finally {
      await this.#sandboxSession.destroy();
    }
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

    let completed = false;
    let text = "";
    let finishReason: FinishReason | undefined;
    let usage: AgentUsage = {};

    try {
      const result = await this.#harnessAgent.stream({
        session: this.#session,
        prompt: input,
        abortSignal: abortController.signal,
      });

      for await (const part of result.stream) {
        if (!isRecord(part) || typeof part.type !== "string") {
          throw new AgentError(
            "invalid-stream-part",
            "The harness stream produced a part without a string type.",
          );
        }

        switch (part.type) {
          case "text-delta": {
            if (typeof part.text !== "string") {
              throw new AgentError(
                "invalid-stream-part",
                "The harness stream produced a text-delta part without text.",
              );
            }
            text += part.text;
            yield { type: "text-delta", text: part.text };
            break;
          }
          case "finish": {
            if (!isFinishReason(part.finishReason)) {
              throw new AgentError(
                "invalid-stream-part",
                "The harness stream produced a finish part with an unknown finish reason.",
              );
            }
            finishReason = part.finishReason;
            usage = toAgentUsage(part.totalUsage);
            break;
          }
          case "error": {
            throw part.error;
          }
          case "abort": {
            throw new DOMException(
              typeof part.reason === "string" ? part.reason : "The turn was aborted.",
              "AbortError",
            );
          }
          default:
            break;
        }
      }

      if (this.#session.hasUnfinishedTurn()) {
        throw new AgentError(
          "turn-unfinished",
          "The harness turn is waiting for input that this adapter does not support, such as tool approval. Close the session or configure the harness to resolve the request automatically.",
        );
      }
      if (finishReason === undefined) {
        throw new AgentError("turn-unfinished", "The harness stream ended without a finish event.");
      }

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

async function destroySandboxIgnoringErrors(sandboxSession: HarnessSandboxSession): Promise<void> {
  try {
    await sandboxSession.destroy();
  } catch {
    // Preserve the error that prevented the harness session from being created.
  }
}
