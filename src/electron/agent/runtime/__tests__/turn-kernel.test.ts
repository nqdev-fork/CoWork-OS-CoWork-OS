import { describe, expect, it, vi } from "vitest";

import { TurnKernel } from "../turn-kernel";

describe("TurnKernel", () => {
  it("retries the same iteration when response preparation recovers messages", async () => {
    const beforeIteration = vi.fn();
    const requestResponse = vi
      .fn()
      .mockResolvedValueOnce({
        recovered: true,
        messages: [{ role: "user", content: "recovered" }],
      })
      .mockResolvedValueOnce({
        response: { stopReason: "end_turn", content: [{ type: "text", text: "done" }] },
        availableTools: [],
      });

    const kernel = new TurnKernel(
      {
        mode: "follow_up",
        messages: [{ role: "user", content: "start" }],
        maxIterations: 4,
        maxEmptyResponses: 2,
      },
      {
        beforeIteration,
        requestResponse,
        handleResponse: async () => ({ continueLoop: false }),
      },
    );

    const result = await kernel.run();

    expect(beforeIteration).toHaveBeenCalledTimes(2);
    expect(requestResponse).toHaveBeenCalledTimes(2);
    expect(result.iterations).toBe(1);
    expect(result.messages).toEqual([{ role: "user", content: "recovered" }]);
  });

  it("stops when max empty response count is reached", async () => {
    const kernel = new TurnKernel(
      {
        mode: "step",
        messages: [{ role: "user", content: "start" }],
        maxIterations: 5,
        maxEmptyResponses: 1,
      },
      {
        requestResponse: async () => ({
          response: { stopReason: "end_turn", content: [] },
          availableTools: [],
        }),
        handleResponse: async () => ({ emptyResponseCount: 1, continueLoop: true }),
      },
    );

    const result = await kernel.run();

    expect(result.stopReason).toBe("max_empty_responses");
    expect(result.iterations).toBe(1);
  });

  it("stops immediately when response preparation requests a terminal stop", async () => {
    const handleResponse = vi.fn();
    const kernel = new TurnKernel(
      {
        mode: "step",
        messages: [{ role: "user", content: "start" }],
        maxIterations: 5,
        maxEmptyResponses: 2,
      },
      {
        requestResponse: async () => ({
          stopped: true,
          messages: [{ role: "user", content: "halted" }],
          stopReason: "context_capacity_exhausted",
        }),
        handleResponse,
      },
    );

    const result = await kernel.run();

    expect(handleResponse).not.toHaveBeenCalled();
    expect(result.stopReason).toBe("context_capacity_exhausted");
    expect(result.messages).toEqual([{ role: "user", content: "halted" }]);
    expect(result.iterations).toBe(1);
  });
});
