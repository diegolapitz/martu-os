import { describe, expect, it } from "vitest";

import { AgentTimeoutError, withAgentTimeout } from "./timeout";

describe("withAgentTimeout", () => {
  it("aborts and rejects a stalled model at the deadline", async () => {
    let receivedSignal: AbortSignal | undefined;
    const result = withAgentTimeout((signal) => {
      receivedSignal = signal;
      return new Promise<never>(() => undefined);
    }, 5, () => false);

    await expect(result).rejects.toBeInstanceOf(AgentTimeoutError);
    expect(receivedSignal?.aborted).toBe(true);
  });

  it("waits for an in-flight write, then rejects immediately after it settles", async () => {
    let mutationInFlight = true;
    const result = withAgentTimeout(
      () => new Promise<never>(() => undefined),
      5,
      () => mutationInFlight,
    );

    const whileWriting = await Promise.race([
      result.then(() => "settled", () => "settled"),
      delay(20).then(() => "pending"),
    ]);
    expect(whileWriting).toBe("pending");

    mutationInFlight = false;
    await expect(result).rejects.toBeInstanceOf(AgentTimeoutError);
  });
});

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
