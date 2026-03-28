export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(200).end();
  }

  const models = [
    { id: "gpt-4o", name: "GPT-4o", provider: "openai" },
    { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "openai" },
    { id: "gpt-4-turbo", name: "GPT-4 Turbo", provider: "openai" },
    { id: "o3-mini", name: "o3 Mini", provider: "openai" },
    { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", provider: "anthropic" },
    { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet", provider: "anthropic" },
    { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku", provider: "anthropic" },
    { id: "gemini/gemini-2.0-flash", name: "Gemini 2.0 Flash", provider: "google" },
    { id: "gemini/gemini-1.5-pro", name: "Gemini 1.5 Pro", provider: "google" },
    { id: "deepseek/deepseek-chat", name: "DeepSeek V3", provider: "deepseek" },
    { id: "deepseek/deepseek-reasoner", name: "DeepSeek R1", provider: "deepseek" },
    { id: "groq/llama-3.3-70b-versatile", name: "Llama 3.3 70B (Groq)", provider: "groq" },
    { id: "openrouter/meta-llama/llama-3.1-405b-instruct", name: "Llama 3.1 405B (OpenRouter)", provider: "openrouter" },
    { id: "glm-5.1", name: "GLM 5.1", provider: "zhipu" },
    { id: "glm-4-plus", name: "GLM 4 Plus", provider: "zhipu" },
    { id: "glm-4-flash", name: "GLM 4 Flash", provider: "zhipu" },
    { id: "openai/custom", name: "Custom (OpenAI-compatible)", provider: "custom" },
  ];

  res.status(200).json({ models });
}
