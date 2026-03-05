import { describe, expect, it } from "vitest";
import { evaluateToolPolicy } from "../tool-policy-engine";

describe("tool-policy-engine request_user_input gating", () => {
  it("allows request_user_input in propose mode", () => {
    const decision = evaluateToolPolicy("request_user_input", {
      executionMode: "propose",
      taskDomain: "auto",
    });
    expect(decision.decision).toBe("allow");
  });

  it("denies request_user_input in execute mode", () => {
    const decision = evaluateToolPolicy("request_user_input", {
      executionMode: "execute",
      taskDomain: "auto",
    });
    expect(decision.decision).toBe("deny");
    expect(decision.reason).toContain("only available in propose mode");
  });

  it("denies request_user_input in analyze mode", () => {
    const decision = evaluateToolPolicy("request_user_input", {
      executionMode: "analyze",
      taskDomain: "auto",
    });
    expect(decision.decision).toBe("deny");
    expect(decision.reason).toContain("only available in propose mode");
  });
});
