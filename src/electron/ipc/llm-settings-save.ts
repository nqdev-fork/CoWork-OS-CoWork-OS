import type { LLMSettingsData } from "../../shared/types";

function normalizeAzureSettings(
  incoming?: LLMSettingsData["azure"],
  existing?: LLMSettingsData["azure"],
): LLMSettingsData["azure"] | undefined {
  if (!incoming && !existing) return undefined;
  const mergedDeployments = [...(incoming?.deployments || []), ...(existing?.deployments || [])]
    .map((entry) => entry.trim())
    .filter(Boolean);
  const deployment = (
    incoming?.deployment ||
    existing?.deployment ||
    mergedDeployments[0] ||
    ""
  ).trim();
  if (deployment && !mergedDeployments.includes(deployment)) {
    mergedDeployments.unshift(deployment);
  }
  return {
    ...existing,
    ...incoming,
    deployment: deployment || undefined,
    deployments: mergedDeployments.length > 0 ? Array.from(new Set(mergedDeployments)) : undefined,
  };
}

function normalizeAzureAnthropicSettings(
  incoming?: LLMSettingsData["azureAnthropic"],
  existing?: LLMSettingsData["azureAnthropic"],
): LLMSettingsData["azureAnthropic"] | undefined {
  if (!incoming && !existing) return undefined;
  const mergedDeployments = [...(incoming?.deployments || []), ...(existing?.deployments || [])]
    .map((entry) => entry.trim())
    .filter(Boolean);
  const deployment = (
    incoming?.deployment ||
    existing?.deployment ||
    mergedDeployments[0] ||
    ""
  ).trim();
  if (deployment && !mergedDeployments.includes(deployment)) {
    mergedDeployments.unshift(deployment);
  }
  return {
    ...existing,
    ...incoming,
    deployment: deployment || undefined,
    deployments: mergedDeployments.length > 0 ? Array.from(new Set(mergedDeployments)) : undefined,
  };
}

export function buildSavedLLMSettings(
  validated: LLMSettingsData,
  existingSettings: LLMSettingsData,
): LLMSettingsData {
  const existingOpenAISettings = existingSettings.openai;
  let openaiSettings = validated.openai;
  const shouldPreserveOpenAIOAuthTokens =
    existingOpenAISettings?.authMethod === "oauth" &&
    validated.openai?.authMethod !== "api_key";
  if (shouldPreserveOpenAIOAuthTokens && existingOpenAISettings) {
    openaiSettings = {
      ...validated.openai,
      accessToken: existingOpenAISettings.accessToken,
      refreshToken: existingOpenAISettings.refreshToken,
      tokenExpiresAt: existingOpenAISettings.tokenExpiresAt,
      authMethod:
        validated.openai?.authMethod || existingOpenAISettings.authMethod,
    };
  }

  return {
    providerType: validated.providerType,
    modelKey: validated.modelKey,
    fallbackProviders: validated.fallbackProviders,
    failoverPrimaryRetryCooldownSeconds: Object.prototype.hasOwnProperty.call(
      validated,
      "failoverPrimaryRetryCooldownSeconds",
    )
      ? validated.failoverPrimaryRetryCooldownSeconds
      : existingSettings.failoverPrimaryRetryCooldownSeconds,
    promptCaching: validated.promptCaching ?? existingSettings.promptCaching,
    anthropic: validated.anthropic,
    bedrock: validated.bedrock,
    ollama: validated.ollama,
    gemini: validated.gemini,
    openrouter: validated.openrouter,
    openai: openaiSettings,
    azure: normalizeAzureSettings(validated.azure, existingSettings.azure),
    azureAnthropic: normalizeAzureAnthropicSettings(
      validated.azureAnthropic,
      existingSettings.azureAnthropic,
    ),
    groq: validated.groq,
    xai: validated.xai,
    kimi: validated.kimi,
    openaiCompatible: validated.openaiCompatible,
    customProviders: validated.customProviders ?? existingSettings.customProviders,
    imageGeneration: validated.imageGeneration ?? existingSettings.imageGeneration,
    videoGeneration: validated.videoGeneration ?? existingSettings.videoGeneration,
    cachedAnthropicModels: existingSettings.cachedAnthropicModels,
    cachedGeminiModels: existingSettings.cachedGeminiModels,
    cachedOpenRouterModels: existingSettings.cachedOpenRouterModels,
    cachedOllamaModels: existingSettings.cachedOllamaModels,
    cachedBedrockModels: existingSettings.cachedBedrockModels,
    cachedOpenAIModels: existingSettings.cachedOpenAIModels,
    cachedGroqModels: existingSettings.cachedGroqModels,
    cachedXaiModels: existingSettings.cachedXaiModels,
    cachedKimiModels: existingSettings.cachedKimiModels,
    cachedOpenAICompatibleModels: existingSettings.cachedOpenAICompatibleModels,
  };
}
