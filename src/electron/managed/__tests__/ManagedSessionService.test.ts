import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AgentRoleRepository } from "../../agents/AgentRoleRepository";
import { TaskEventRepository, TaskRepository } from "../../database/repositories";
import { DatabaseManager } from "../../database/schema";
import { MCPSettingsManager } from "../../mcp/settings";
import { ManagedSessionService } from "../ManagedSessionService";

const nativeSqliteAvailable = await import("better-sqlite3")
  .then((module) => {
    try {
      const Database = module.default;
      const probe = new Database(":memory:");
      probe.close();
      return true;
    } catch {
      return false;
    }
  })
  .catch(() => false);

const describeWithSqlite = nativeSqliteAvailable ? describe : describe.skip;

describeWithSqlite("ManagedSessionService", () => {
  let tmpDir: string;
  let previousUserDataDir: string | undefined;
  let manager: DatabaseManager;
  let db: ReturnType<DatabaseManager["getDatabase"]>;
  let taskRepo: TaskRepository;
  let taskEventRepo: TaskEventRepository;
  let service: ManagedSessionService;
  let daemon: Any;

  const insertWorkspace = (name = "managed-test") => {
    const workspace = {
      id: `ws-${Math.random().toString(36).slice(2, 10)}`,
      name,
      path: path.join(tmpDir, name),
      createdAt: Date.now(),
      permissions: JSON.stringify({
        read: true,
        write: true,
        delete: true,
        network: true,
        shell: true,
      }),
    };
    fs.mkdirSync(workspace.path, { recursive: true });
    db.prepare(
      `
        INSERT INTO workspaces (id, name, path, created_at, permissions)
        VALUES (?, ?, ?, ?, ?)
      `,
    ).run(workspace.id, workspace.name, workspace.path, workspace.createdAt, workspace.permissions);
    return workspace;
  };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cowork-managed-session-"));
    previousUserDataDir = process.env.COWORK_USER_DATA_DIR;
    process.env.COWORK_USER_DATA_DIR = tmpDir;

    manager = new DatabaseManager();
    db = manager.getDatabase();
    taskRepo = new TaskRepository(db);
    taskEventRepo = new TaskEventRepository(db);

    daemon = {
      startTask: vi.fn(async (task: Any) => {
        taskRepo.update(task.id, { status: "executing" });
        task.status = "executing";
      }),
      cancelTask: vi.fn(async (taskId: string) => {
        taskRepo.update(taskId, {
          status: "cancelled",
          terminalStatus: "cancelled",
          completedAt: Date.now(),
        });
      }),
      resumeTask: vi.fn(async (taskId: string) => {
        taskRepo.update(taskId, { status: "executing" });
        return true;
      }),
      sendMessage: vi.fn(async () => {}),
      respondToInputRequest: vi.fn(async () => {}),
      failTask: vi.fn((taskId: string, message: string) => {
        taskRepo.update(taskId, { status: "failed", error: message, completedAt: Date.now() });
      }),
      teamOrchestrator: {
        tickRun: vi.fn(async () => {}),
        cancelRun: vi.fn(async () => {}),
      },
    };

    service = new ManagedSessionService(db, daemon);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    manager?.close();
    if (previousUserDataDir === undefined) {
      delete process.env.COWORK_USER_DATA_DIR;
    } else {
      process.env.COWORK_USER_DATA_DIR = previousUserDataDir;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("pins managed sessions to the agent version used at creation time", async () => {
    const workspace = insertWorkspace();
    const environment = service.createEnvironment({
      name: "Local env",
      config: {
        workspaceId: workspace.id,
        enableShell: true,
      },
    });
    const created = service.createAgent({
      name: "Pinned agent",
      systemPrompt: "You are version one.",
      executionMode: "solo",
    });

    const firstSession = await service.createSession({
      agentId: created.agent.id,
      environmentId: environment.id,
      title: "First run",
      initialEvent: {
        type: "user.message",
        content: [{ type: "text", text: "First request" }],
      },
    });

    const updated = service.updateAgent(created.agent.id, {
      name: "Pinned agent v2",
      systemPrompt: "You are version two.",
      executionMode: "solo",
    });

    const secondSession = await service.createSession({
      agentId: created.agent.id,
      environmentId: environment.id,
      title: "Second run",
      initialEvent: {
        type: "user.message",
        content: [{ type: "text", text: "Second request" }],
      },
    });

    expect(daemon.startTask).toHaveBeenCalledTimes(2);
    expect(firstSession.agentVersion).toBe(1);
    expect(service.getSession(firstSession.id)?.agentVersion).toBe(1);
    expect(updated.agent.currentVersion).toBe(2);
    expect(secondSession.agentVersion).toBe(2);
  });

  it("applies managed shell access to the task without persisting workspace permissions", async () => {
    const workspace = insertWorkspace("shell-session");
    db.prepare("UPDATE workspaces SET permissions = ? WHERE id = ?").run(
      JSON.stringify({
        read: true,
        write: true,
        delete: true,
        network: true,
        shell: false,
      }),
      workspace.id,
    );

    const environment = service.createEnvironment({
      name: "Scoped shell env",
      config: {
        workspaceId: workspace.id,
        enableShell: true,
      },
    });
    const created = service.createAgent({
      name: "Scoped shell agent",
      systemPrompt: "Use shell only for this session.",
      executionMode: "solo",
    });

    const session = await service.createSession({
      agentId: created.agent.id,
      environmentId: environment.id,
      title: "Scoped shell run",
    });

    const backingTask = taskRepo.findById(session.backingTaskId!);
    const storedWorkspace = db
      .prepare("SELECT permissions FROM workspaces WHERE id = ?")
      .get(workspace.id) as { permissions: string };

    expect(backingTask?.agentConfig?.shellAccess).toBe(true);
    expect(JSON.parse(storedWorkspace.permissions).shell).toBe(false);
  });

  it("supports partial managed agent updates by carrying forward unspecified version fields", () => {
    const created = service.createAgent({
      name: "Partial update agent",
      systemPrompt: "Version one system prompt.",
      executionMode: "solo",
      runtimeDefaults: {
        allowUserInput: false,
        maxTurns: 5,
      },
    });

    const updated = service.updateAgent(created.agent.id, {
      name: "Renamed partial agent",
    });

    expect(updated.agent.name).toBe("Renamed partial agent");
    expect(updated.version.systemPrompt).toBe("Version one system prompt.");
    expect(updated.version.executionMode).toBe("solo");
    expect(updated.version.runtimeDefaults).toMatchObject({
      allowUserInput: false,
      maxTurns: 5,
    });
  });

  it("sanitizes bridged task event payloads before persisting managed session events", async () => {
    const workspace = insertWorkspace();
    const environment = service.createEnvironment({
      name: "Local env",
      config: { workspaceId: workspace.id },
    });
    const created = service.createAgent({
      name: "Sanitizer",
      systemPrompt: "Keep things safe.",
      executionMode: "solo",
    });
    const session = await service.createSession({
      agentId: created.agent.id,
      environmentId: environment.id,
      title: "Sanitized run",
    });

    taskEventRepo.create({
      taskId: session.backingTaskId!,
      timestamp: Date.now(),
      type: "tool_call",
      payload: {
        prompt: "raw prompt should not leave storage",
        apiKey: "super-secret",
        nested: {
          authorization: "Bearer hidden",
        },
        message: "x".repeat(13_000),
      },
    });

    const events = service.listSessionEvents(session.id);
    const bridged = events.find((event) => event.type === "tool.call");

    expect(bridged?.payload.prompt).toBe("[REDACTED]");
    expect(bridged?.payload.apiKey).toBe("[REDACTED]");
    expect((bridged?.payload.nested as Any)?.authorization).toBe("[REDACTED]");
    expect(typeof bridged?.payload.message).toBe("string");
    expect(String(bridged?.payload.message)).toContain("[... truncated");
  });

  it("fails closed when an environment MCP allowlist cannot resolve tool metadata", async () => {
    const workspace = insertWorkspace();
    const loadSettingsSpy = vi
      .spyOn(MCPSettingsManager, "loadSettings")
      .mockReturnValue({ toolNamePrefix: "mcp_" } as Any);
    const getServerSpy = vi.spyOn(MCPSettingsManager, "getServer").mockReturnValue({
      id: "server-1",
      name: "Broken server",
      tools: [],
    } as Any);

    const environment = service.createEnvironment({
      name: "Locked env",
      config: {
        workspaceId: workspace.id,
        allowedMcpServerIds: ["server-1"],
      },
    });
    const created = service.createAgent({
      name: "Fail closed agent",
      systemPrompt: "Only use approved tools.",
      executionMode: "solo",
    });

    await expect(
      service.createSession({
        agentId: created.agent.id,
        environmentId: environment.id,
        title: "Should fail",
      }),
    ).rejects.toThrow(/tool metadata/i);

    expect(loadSettingsSpy).toHaveBeenCalled();
    expect(getServerSpy).toHaveBeenCalledWith("server-1");
    expect(daemon.startTask).not.toHaveBeenCalled();
    expect(db.prepare("SELECT COUNT(1) AS count FROM tasks").get() as Any).toMatchObject({ count: 0 });
  });

  it("starts team-mode sessions through the daemon path and blocks direct follow-up user messages", async () => {
    const workspace = insertWorkspace();
    const roleRepo = new AgentRoleRepository(db);
    const lead = roleRepo.create({
      name: "managed-team-lead",
      displayName: "Managed Team Lead",
      capabilities: [],
    });
    const environment = service.createEnvironment({
      name: "Team env",
      config: { workspaceId: workspace.id },
    });
    const created = service.createAgent({
      name: "Team agent",
      systemPrompt: "Coordinate the team.",
      executionMode: "team",
      teamTemplate: {
        leadAgentRoleId: lead.id,
        memberAgentRoleIds: [lead.id],
        maxParallelAgents: 1,
        collaborativeMode: true,
      },
    });

    const session = await service.createSession({
      agentId: created.agent.id,
      environmentId: environment.id,
      title: "Team run",
      initialEvent: {
        type: "user.message",
        content: [{ type: "text", text: "Investigate the repo." }],
      },
    });

    expect(daemon.startTask).toHaveBeenCalledTimes(1);
    expect(session.backingTaskId).toBeTruthy();
    expect(session.backingTeamRunId).toBeTruthy();
    expect(service.getSession(session.id)?.status).toBe("running");

    await expect(
      service.sendEvent(session.id, {
        type: "user.message",
        content: [{ type: "text", text: "One more thing" }],
      }),
    ).rejects.toThrow(/team-mode managed sessions/i);
    expect(daemon.sendMessage).not.toHaveBeenCalled();
  });
});
