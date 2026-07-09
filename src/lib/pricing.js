const PRICES_PER_MTOK = [
  { match: /opus-4-(5|6|7|8)/i, input: 5, output: 25 },
  { match: /sonnet-4-(5|6)/i, input: 3, output: 15 },
  { match: /sonnet-4(?!-)/i, input: 3, output: 15 },
  { match: /haiku-4-5/i, input: 1, output: 5 },
  { match: /haiku-3-5/i, input: 0.8, output: 4 },
];

export function estimateClaudeCost(model, usage) {
  if (!usage) return null;

  const price = findPrice(model);
  if (!price) return null;

  const inputTokens = usage.input_tokens || 0;
  const outputTokens = usage.output_tokens || 0;
  const cacheCreationTokens = usage.cache_creation_input_tokens || 0;
  const cacheReadTokens = usage.cache_read_input_tokens || 0;

  const inputCost = (inputTokens / 1_000_000) * price.input;
  const outputCost = (outputTokens / 1_000_000) * price.output;
  const cacheCreationCost = (cacheCreationTokens / 1_000_000) * price.input * 1.25;
  const cacheReadCost = (cacheReadTokens / 1_000_000) * price.input * 0.1;

  return {
    currency: "USD",
    inputTokens,
    outputTokens,
    cacheCreationTokens,
    cacheReadTokens,
    inputRatePerMTok: price.input,
    outputRatePerMTok: price.output,
    inputCost,
    outputCost,
    cacheCreationCost,
    cacheReadCost,
    totalCost: inputCost + outputCost + cacheCreationCost + cacheReadCost,
  };
}

export function estimateCustomCost(config, usage) {
  if (!usage) return null;

  const input = Number(config.inputPricePerMTok);
  const output = Number(config.outputPricePerMTok);
  if (!Number.isFinite(input) || !Number.isFinite(output) || input < 0 || output < 0) {
    return null;
  }

  const inputTokens = usage.input_tokens || 0;
  const outputTokens = usage.output_tokens || 0;
  const inputCost = (inputTokens / 1_000_000) * input;
  const outputCost = (outputTokens / 1_000_000) * output;

  return {
    currency: "USD",
    inputTokens,
    outputTokens,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    inputRatePerMTok: input,
    outputRatePerMTok: output,
    inputCost,
    outputCost,
    cacheCreationCost: 0,
    cacheReadCost: 0,
    totalCost: inputCost + outputCost,
  };
}

export function estimateSettingsCost(settings, usage) {
  if (!settings || !usage) return null;
  if (settings.provider === "openai-compatible") {
    return estimateCustomCost(settings.openaiCompatible || {}, usage);
  }
  return estimateClaudeCost(settings.anthropic?.model, usage);
}

export function formatUsd(value) {
  if (typeof value !== "number") return "未知";
  if (value === 0) return "$0.0000";
  if (value < 0.0001) return "<$0.0001";
  return `$${value.toFixed(4)}`;
}

function findPrice(model = "") {
  return PRICES_PER_MTOK.find((price) => price.match.test(model));
}
