import { describe, expect, it } from "vitest";
import { buildToolResultEnvelope } from "../tool-result-envelope";

describe("buildToolResultEnvelope", () => {
  it("derives file and policy evidence from structured results", () => {
    const envelope = buildToolResultEnvelope({
      toolUseId: "tool-1",
      toolName: "write_file",
      status: "success",
      result: {
        path: "src/example.ts",
        success: true,
      },
      policyTrace: {
        toolName: "write_file",
        finalDecision: "allow",
        entries: [],
      },
    });

    expect(envelope.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "file",
          value: "src/example.ts",
        }),
        expect.objectContaining({
          type: "runtime_log",
          value: "final decision: allow",
        }),
      ]),
    );
  });
});
