import OpenAI from "openai";

const SYSTEM_PROMPT =
  "You are OmniCode, an expert coding assistant. You help users write, debug, explain, and refactor code. Always format code with proper markdown code blocks including the language identifier. Be concise but thorough.";

// Map litellm-style model IDs to OpenAI-compatible API endpoints
function getProviderConfig(modelId, apiKey, apiBase) {
  // Custom endpoint — use whatever base URL user provides
  if (modelId === "openai/custom" && apiBase) {
    return { apiKey, baseURL: apiBase, model: "default" };
  }

  // DeepSeek
  if (modelId.startsWith("deepseek/")) {
    return {
      apiKey,
      baseURL: "https://api.deepseek.com",
      model: modelId.replace("deepseek/", ""),
    };
  }

  // Groq
  if (modelId.startsWith("groq/")) {
    return {
      apiKey,
      baseURL: "https://api.groq.com/openai/v1",
      model: modelId.replace("groq/", ""),
    };
  }

  // Google Gemini via OpenAI compatibility
  if (modelId.startsWith("gemini/")) {
    return {
      apiKey,
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
      model: modelId.replace("gemini/", ""),
    };
  }

  // OpenRouter
  if (modelId.startsWith("openrouter/")) {
    return {
      apiKey,
      baseURL: "https://openrouter.ai/api/v1",
      model: modelId.replace("openrouter/", ""),
    };
  }

  // Anthropic — use messages API format but via OpenAI SDK won't work,
  // so we use a proxy approach or tell user to use OpenRouter
  if (modelId.startsWith("claude")) {
    // Anthropic has OpenAI-compatible endpoint now
    return {
      apiKey,
      baseURL: "https://api.anthropic.com/v1",
      model: modelId,
      isAnthropic: true,
    };
  }

  // Zhipu AI (GLM models)
  if (modelId.startsWith("glm")) {
    return {
      apiKey,
      baseURL: "https://open.bigmodel.cn/api/paas/v4",
      model: modelId,
    };
  }

  // OpenAI (default)
  return {
    apiKey,
    baseURL: apiBase || "https://api.openai.com/v1",
    model: modelId,
  };
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { model: modelId, messages, api_key, api_base, temperature } = req.body;

  if (!api_key) {
    return res.status(400).json({ error: "API key is required" });
  }
  if (!messages || !messages.length) {
    return res.status(400).json({ error: "Messages are required" });
  }

  const config = getProviderConfig(modelId, api_key, api_base);

  // Prepend system message
  let allMessages = messages;
  if (messages[0].role !== "system") {
    allMessages = [{ role: "system", content: SYSTEM_PROMPT }, ...messages];
  }

  try {
    // Anthropic uses a different API format
    if (config.isAnthropic) {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": config.apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          messages: messages.map((m) => ({ role: m.role === "system" ? "user" : m.role, content: m.content })),
          temperature: temperature || 0.7,
        }),
      });

      const data = await response.json();
      if (data.error) {
        return res.status(500).json({ error: data.error.message || JSON.stringify(data.error) });
      }
      const content = data.content?.[0]?.text || "";
      return res.status(200).json({ content });
    }

    // All OpenAI-compatible providers
    const openai = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    });

    const response = await openai.chat.completions.create({
      model: config.model,
      messages: allMessages,
      temperature: temperature || 0.7,
      max_tokens: 4096,
    });

    const content = response.choices[0]?.message?.content || "";
    return res.status(200).json({ content });
  } catch (error) {
    const msg = error.error?.message || error.message || "Unknown error";
    return res.status(500).json({ error: msg });
  }
}
