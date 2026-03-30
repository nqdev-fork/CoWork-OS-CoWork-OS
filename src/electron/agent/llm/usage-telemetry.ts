import { randomUUID } from "crypto";
import type { LLMResponse } from "./types";
import { DatabaseManager } from "../../database/schema";
import { calculateCost } from "./pricing";

type LlmCallTelemetryInput = {
  workspaceId?: string | null;
  taskId?: string | null;
  sourceKind: string;
  sourceId?: string | null;
  providerType?: string | null;
  modelKey?: string | null;
  modelId?: string | null;
  timestamp?: number;
};

function getDb() {
  try {
    return DatabaseManager.getInstance().getDatabase();
  } catch {
    return null;
  }
}

export function recordLlmCallSuccess(
  input: LlmCallTelemetryInput,
  usage?: LLMResponse["usage"],
): void {
  const db = getDb();
  if (!db) return;

  const inputTokens = Math.max(0, Number(usage?.inputTokens || 0));
  const outputTokens = Math.max(0, Number(usage?.outputTokens || 0));
  const cachedTokens = Math.max(0, Number(usage?.cachedTokens || 0));
  const modelId = input.modelId || input.modelKey || "";
  const cost =
    inputTokens > 0 || outputTokens > 0 || cachedTokens > 0
      ? calculateCost(modelId, inputTokens, outputTokens, cachedTokens)
      : 0;

  try {
    db.prepare(
      `INSERT INTO llm_call_events (
        id,
        timestamp,
        workspace_id,
        task_id,
        source_kind,
        source_id,
        provider_type,
        model_key,
        model_id,
        input_tokens,
        output_tokens,
        cached_tokens,
        cost,
        success,
        error_code,
        error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, NULL)`,
    ).run(
      randomUUID(),
      input.timestamp || Date.now(),
      input.workspaceId || null,
      input.taskId || null,
      input.sourceKind,
      input.sourceId || null,
      input.providerType || null,
      input.modelKey || input.modelId || null,
      input.modelId || input.modelKey || null,
      inputTokens,
      outputTokens,
      cachedTokens,
      cost,
    );
  } catch {
    // Best-effort telemetry only.
  }
}

export function recordLlmCallError(
  input: LlmCallTelemetryInput,
  error: unknown,
): void {
  const db = getDb();
  if (!db) return;

  const errorObj =
    error && typeof error === "object" ? (error as { code?: unknown; message?: unknown; name?: unknown }) : null;
  const errorCode =
    typeof errorObj?.code === "string"
      ? errorObj.code
      : typeof errorObj?.name === "string"
        ? errorObj.name
        : "llm_error";
  const errorMessage =
    typeof errorObj?.message === "string" ? errorObj.message.slice(0, 500) : String(error || "LLM error");

  try {
    db.prepare(
      `INSERT INTO llm_call_events (
        id,
        timestamp,
        workspace_id,
        task_id,
        source_kind,
        source_id,
        provider_type,
        model_key,
        model_id,
        input_tokens,
        output_tokens,
        cached_tokens,
        cost,
        success,
        error_code,
        error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, ?, ?)`,
    ).run(
      randomUUID(),
      input.timestamp || Date.now(),
      input.workspaceId || null,
      input.taskId || null,
      input.sourceKind,
      input.sourceId || null,
      input.providerType || null,
      input.modelKey || input.modelId || null,
      input.modelId || input.modelKey || null,
      errorCode,
      errorMessage,
    );
  } catch {
    // Best-effort telemetry only.
  }
}
