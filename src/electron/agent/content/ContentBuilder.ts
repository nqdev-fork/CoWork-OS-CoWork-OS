import {
  SHARED_PROMPT_POLICY_CORE,
  buildModeDomainContract,
  composePromptSections,
  type PromptSection,
} from "../executor-prompt-sections";
import type { ExecutionMode, TaskDomain } from "../../../shared/types";
import { LayeredMemoryIndexService } from "../../memory/LayeredMemoryIndexService";

export interface BuildExecutionPromptParams {
  workspaceId: string;
  workspacePath: string;
  taskPrompt: string;
  identityPrompt?: string;
  roleContext?: string;
  memoryContext?: string;
  awarenessSnapshot?: string;
  infraContext?: string;
  visualQAContext?: string;
  personalityPrompt?: string;
  guidelinesPrompt?: string;
  coreInstructions?: string;
  executionMode: ExecutionMode;
  taskDomain: TaskDomain;
  webSearchModeContract: string;
  worktreeBranch?: string;
  allowLayeredMemory?: boolean;
  totalBudgetTokens: number;
}

export interface BuildExecutionPromptResult {
  prompt: string;
  totalTokens: number;
  droppedSections: string[];
  truncatedSections: string[];
  topicCount: number;
  memoryIndexInjected: boolean;
}

function makeSection(
  key: string,
  text: string | undefined,
  maxTokens: number | undefined,
  options?: { required?: boolean; dropPriority?: number; layerKind?: PromptSection["layerKind"] },
): PromptSection {
  return {
    key,
    text: String(text || "").trim(),
    maxTokens,
    required: options?.required,
    dropPriority: options?.dropPriority,
    layerKind: options?.layerKind,
  };
}

export class ContentBuilder {
  static async buildExecutionPrompt(
    params: BuildExecutionPromptParams,
  ): Promise<BuildExecutionPromptResult> {
    let memoryIndex = "";
    let topicText = "";
    let topicCount = 0;

    if (params.allowLayeredMemory) {
      const snapshot = await LayeredMemoryIndexService.refreshIndex({
        workspaceId: params.workspaceId,
        workspacePath: params.workspacePath,
        taskPrompt: params.taskPrompt,
      });
      memoryIndex = snapshot.indexContent;
      topicCount = snapshot.topics.length;
      if (snapshot.topics.length > 0) {
        topicText = snapshot.topics
          .slice(0, 3)
          .map((topic) => `### ${topic.title}\n${topic.content}`)
          .join("\n\n");
      }
    }

    const modeDomainContract = buildModeDomainContract(params.executionMode, params.taskDomain);
    const worktreeContext = params.worktreeBranch
      ? `GIT WORKTREE CONTEXT:\n- Active branch: "${params.worktreeBranch}".\n- Changes stay isolated until explicitly merged.`
      : "";

    const sections: PromptSection[] = [
      makeSection("identity", params.identityPrompt, undefined, {
        required: !params.coreInstructions,
        layerKind: "always",
      }),
      makeSection("role_context", params.roleContext, 900, {
        required: false,
        dropPriority: 2,
        layerKind: "optional",
      }),
      makeSection("memory_index", memoryIndex, 1300, {
        required: params.allowLayeredMemory,
        layerKind: params.allowLayeredMemory ? "always" : "optional",
      }),
      makeSection("memory_topics", topicText, 1000, {
        required: false,
        dropPriority: 4,
        layerKind: "on_demand",
      }),
      makeSection("memory_context", params.memoryContext, 1200, {
        required: false,
        dropPriority: 5,
        layerKind: "optional",
      }),
      makeSection("awareness_snapshot", params.awarenessSnapshot, 800, {
        required: false,
        dropPriority: 6,
        layerKind: "optional",
      }),
      makeSection("infra_context", params.infraContext, 800, {
        required: false,
        dropPriority: 3,
        layerKind: "optional",
      }),
      makeSection("visual_qa", params.visualQAContext, 500, {
        required: false,
        dropPriority: 7,
        layerKind: "optional",
      }),
      makeSection("personality", params.personalityPrompt, 700, {
        required: false,
        dropPriority: 8,
        layerKind: "optional",
      }),
      makeSection("guidelines", params.guidelinesPrompt, 700, {
        required: false,
        dropPriority: 9,
        layerKind: "optional",
      }),
      makeSection(
        "execution_contract",
        params.coreInstructions ||
          [
            SHARED_PROMPT_POLICY_CORE,
            `Current time: ${new Date().toString()}`,
            `Workspace: ${params.workspacePath}`,
            modeDomainContract,
            params.webSearchModeContract,
            worktreeContext,
          ]
            .filter(Boolean)
            .join("\n\n"),
        undefined,
        { required: true, layerKind: "always" },
      ),
    ];

    const composed = composePromptSections(sections, params.totalBudgetTokens);
    return {
      prompt: composed.prompt,
      totalTokens: composed.totalTokens,
      droppedSections: composed.droppedSections,
      truncatedSections: composed.truncatedSections,
      topicCount,
      memoryIndexInjected: Boolean(memoryIndex),
    };
  }
}
