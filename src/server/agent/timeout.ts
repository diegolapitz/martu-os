export const AGENT_TURN_TIMEOUT_MS = 8_000;
export const AGENT_CONTEXT_TIMEOUT_MS = 6_000;

export class AgentTimeoutError extends Error {
  constructor() {
    super("La supervisora tardó más de ocho segundos.");
    this.name = "AgentTimeoutError";
  }
}

export async function withAgentTimeout<T>(
  work: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  isMutationInFlight: () => boolean,
): Promise<T> {
  const controller = new AbortController();
  let rejectTimeout: ((reason: AgentTimeoutError) => void) | undefined;
  let deadlineExpired = false;
  let mutationPoll: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    rejectTimeout = reject;
  });
  const rejectAsSoonAsSafe = () => {
    if (!deadlineExpired) return;
    if (isMutationInFlight()) {
      mutationPoll = setTimeout(rejectAsSoonAsSafe, 5);
      return;
    }
    rejectTimeout?.(new AgentTimeoutError());
  };
  const timer = setTimeout(() => {
    deadlineExpired = true;
    controller.abort();
    // Never abandon an in-flight database write: the provider receives the
    // aborted signal, but the timeout rejects only once the durable write has
    // settled. Polling closes the race where the original deadline fired in
    // the middle of a write and would otherwise never reject afterward.
    rejectAsSoonAsSafe();
  }, Math.max(1, timeoutMs));

  try {
    return await Promise.race([work(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
    if (mutationPoll) clearTimeout(mutationPoll);
  }
}

export function isAgentTimeout(error: unknown): error is AgentTimeoutError {
  return error instanceof AgentTimeoutError
    || (error instanceof Error && (
      error.name === "AbortError"
      || error.name === "DatabaseHealthTimeoutError"
      || error.name === "DatabaseOperationTimeoutError"
      || /ocho segundos|aborted|timeout/i.test(error.message)
    ));
}
