import { aiTransport } from "./aiTransport.js";
import { enforceAiBudgetBeforeRequest, recordAiBudgetUsage } from "./aiBudget.js";
import { recordAiDiagnostic } from "./aiDiagnostics.js";
import { resolveAiProfileRequest } from "./aiProfiles.js";

export async function callModelDetailed({
  settings,
  system,
  messages,
  maxTokens,
  signal,
  taskType,
}) {
  const startedAt = new Date();
  let profileRequest = null;
  let budgetCheck = null;
  try {
    profileRequest = resolveAiProfileRequest({ settings, taskType, maxTokens });
    budgetCheck = await enforceAiBudgetBeforeRequest({
      settings: profileRequest.settings,
      system,
      messages,
      maxTokens: profileRequest.maxTokens,
      taskType,
    });
    const result = await aiTransport.callModelDetailed({
      settings: profileRequest.settings,
      system,
      messages,
      maxTokens: profileRequest.maxTokens,
      signal,
      temperature: profileRequest.temperature,
    });
    const detailed = {
      ...result,
      settingsUsed: profileRequest.resultSettings,
      profile: profileRequest.profile,
    };
    await recordAiDiagnostic({
      mode: "call",
      taskType,
      startedAt,
      endedAt: new Date(),
      settings: profileRequest.settings,
      profile: profileRequest.profile,
      budgetCheck,
      result: detailed,
    }).catch(() => null);
    await recordAiBudgetUsage({
      settings: profileRequest.settings,
      result: detailed,
      budgetCheck,
    }).catch(() => null);
    return detailed;
  } catch (error) {
    await recordAiDiagnostic({
      mode: "call",
      taskType,
      startedAt,
      endedAt: new Date(),
      settings: profileRequest?.settings || settings,
      profile: profileRequest?.profile || null,
      budgetCheck,
      error,
    }).catch(() => null);
    throw error;
  }
}

export async function streamModelDetailed({
  settings,
  system,
  messages,
  maxTokens,
  onText,
  signal,
  taskType,
}) {
  const startedAt = new Date();
  let profileRequest = null;
  let budgetCheck = null;
  try {
    profileRequest = resolveAiProfileRequest({ settings, taskType, maxTokens });
    budgetCheck = await enforceAiBudgetBeforeRequest({
      settings: profileRequest.settings,
      system,
      messages,
      maxTokens: profileRequest.maxTokens,
      taskType,
    });
    const result = await aiTransport.streamModelDetailed({
      settings: profileRequest.settings,
      system,
      messages,
      maxTokens: profileRequest.maxTokens,
      onText,
      signal,
      temperature: profileRequest.temperature,
    });
    const detailed = {
      ...result,
      settingsUsed: profileRequest.resultSettings,
      profile: profileRequest.profile,
    };
    await recordAiDiagnostic({
      mode: "stream",
      taskType,
      startedAt,
      endedAt: new Date(),
      settings: profileRequest.settings,
      profile: profileRequest.profile,
      budgetCheck,
      result: detailed,
    }).catch(() => null);
    await recordAiBudgetUsage({
      settings: profileRequest.settings,
      result: detailed,
      budgetCheck,
    }).catch(() => null);
    return detailed;
  } catch (error) {
    await recordAiDiagnostic({
      mode: "stream",
      taskType,
      startedAt,
      endedAt: new Date(),
      settings: profileRequest?.settings || settings,
      profile: profileRequest?.profile || null,
      budgetCheck,
      error,
    }).catch(() => null);
    throw error;
  }
}

export async function testModelConnection(settings) {
  return aiTransport.testModelConnection(settings);
}
