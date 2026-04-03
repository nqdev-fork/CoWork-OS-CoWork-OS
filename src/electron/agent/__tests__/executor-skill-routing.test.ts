import { beforeEach, describe, expect, it, vi } from "vitest";

const rankModelInvocableSkillsForQuery = vi.fn();

vi.mock("../custom-skill-loader", () => ({
  getCustomSkillLoader: () => ({
    rankModelInvocableSkillsForQuery,
  }),
}));

import { TaskExecutor } from "../executor";

describe("TaskExecutor skill shortlist routing", () => {
  function createExecutor(prompt: string, taskOverrides: Any = {}) {
    const executor = Object.create(TaskExecutor.prototype) as Any;

    executor.task = {
      id: "task-skill-route-1",
      title: "Routing test",
      prompt,
      rawPrompt: taskOverrides.rawPrompt ?? prompt,
      userPrompt: taskOverrides.userPrompt ?? prompt,
      createdAt: Date.now() - 1000,
      ...taskOverrides,
    };
    executor.appliedSkills = [];
    executor.taskContextNotes = [];
    executor.emitEvent = vi.fn();
    executor.getAvailableTools = vi.fn(() => [{ name: "use_skill" }]);
    executor.toolRegistry = {
      executeTool: vi.fn(),
    };

    return executor as TaskExecutor & {
      emitEvent: ReturnType<typeof vi.fn>;
      getAvailableTools: ReturnType<typeof vi.fn>;
      toolRegistry: { executeTool: ReturnType<typeof vi.fn> };
    };
  }

  beforeEach(() => {
    rankModelInvocableSkillsForQuery.mockReset();
  });

  it("ranks candidate skills for planning but does not auto-apply them", async () => {
    rankModelInvocableSkillsForQuery.mockReturnValue([
      {
        skill: {
          id: "codex-cli",
          name: "Codex CLI Agent",
          description: "Review a PR with Codex CLI.",
          metadata: { routing: { useWhen: "Use when a coding task needs Codex." } },
        },
        score: 0.93,
      },
      {
        skill: {
          id: "code-review",
          name: "Code Review",
          description: "Review a code change.",
          metadata: { routing: { useWhen: "Use when reviewing code." } },
        },
        score: 0.61,
      },
    ]);

    const prompt = "We need to review PR #55 on cowork os repo. Spin up Codex to review it.";
    const executor = createExecutor(prompt);

    const handled = await (TaskExecutor as Any).prototype.maybeHandleHighConfidenceSkillRouting.call(
      executor,
    );

    expect(handled).toBe(false);
    expect(executor.toolRegistry.executeTool).not.toHaveBeenCalled();
    expect(executor.task.prompt).toBe(prompt);
    expect(executor.emitEvent).toHaveBeenCalledWith(
      "skill_candidates_ranked",
      expect.objectContaining({
        candidates: expect.arrayContaining([
          expect.objectContaining({
            skillId: "codex-cli",
            score: 0.93,
          }),
        ]),
      }),
    );
  });

  it("does not let quoted pasted text hijack the task into a skill", async () => {
    rankModelInvocableSkillsForQuery.mockReturnValue([
      {
        skill: {
          id: "frontend",
          name: "Frontend",
          description: "Implement frontend work.",
          metadata: { routing: { useWhen: "Use for UI implementation tasks." } },
        },
        score: 0.21,
      },
    ]);

    const prompt = [
      "Summarize Karpathy's post and extract the repo names he mentioned.",
      "",
      'Pasted text: I use Obsidian as the IDE "frontend" for most notes.',
    ].join("\n");
    const executor = createExecutor(prompt);

    const handled = await (TaskExecutor as Any).prototype.maybeHandleHighConfidenceSkillRouting.call(
      executor,
    );

    expect(handled).toBe(false);
    expect(executor.toolRegistry.executeTool).not.toHaveBeenCalled();
    expect(executor.task.prompt).toBe(prompt);
    expect(executor.emitEvent).toHaveBeenCalledWith(
      "skill_candidates_ranked",
      expect.objectContaining({
        candidates: expect.any(Array),
      }),
    );
  });
});
