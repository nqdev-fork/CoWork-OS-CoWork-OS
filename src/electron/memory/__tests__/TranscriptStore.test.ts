import fs from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { TranscriptStore } from "../TranscriptStore";

const createdDirs: string[] = [];

async function createWorkspace(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cowork-transcript-store-"));
  createdDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(createdDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("TranscriptStore", () => {
  it("writes checkpoints and restores them synchronously", async () => {
    const workspacePath = await createWorkspace();

    await TranscriptStore.writeCheckpoint(workspacePath, "task-1", {
      conversationHistory: [{ role: "user", content: "hello" }],
      trackerState: { filesRead: ["src/app.ts"] },
    });

    const restored = TranscriptStore.loadCheckpointSync(workspacePath, "task-1");
    expect(restored?.conversationHistory).toEqual([{ role: "user", content: "hello" }]);
  });

  it("appends searchable transcript spans", async () => {
    const workspacePath = await createWorkspace();

    await TranscriptStore.appendEvent(workspacePath, {
      id: "event-1",
      taskId: "task-1",
      timestamp: Date.now(),
      type: "assistant_message",
      payload: { message: "Layered memory is ready" },
      schemaVersion: 2,
    });

    const results = await TranscriptStore.searchSpans({
      workspacePath,
      taskId: "task-1",
      query: "layered memory",
      limit: 5,
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.type).toBe("assistant_message");
  });
});
