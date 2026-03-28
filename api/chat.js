import OpenAI from "openai";

const SYSTEM_PROMPT = `You are OmniCode, an elite full-stack coding assistant capable of building complex, production-quality projects. You are an expert in:

- **Frontend**: HTML5, CSS3, JavaScript (ES6+), TypeScript, React, Vue, Svelte, Next.js, Tailwind CSS, Bootstrap
- **Backend**: Node.js, Python, Flask, Django, FastAPI, Express, REST APIs, GraphQL
- **Database**: SQL, PostgreSQL, MongoDB, SQLite, Redis
- **DevOps**: Docker, CI/CD, Git, Linux, Nginx
- **Mobile**: React Native, Flutter
- **Other**: WebSockets, OAuth, payment integration, real-time apps, game dev, data visualization

## Rules:
1. When building projects, provide ALL files needed — HTML, CSS, JS, config files, everything.
2. Use separate code blocks with the filename as a comment on the first line, e.g.:
   \`\`\`html
   <!-- index.html -->
   ...
   \`\`\`
3. For multi-file projects, list ALL files. Never say "create a file called X" without providing the full content.
4. Always use modern best practices — semantic HTML, responsive CSS, clean architecture.
5. When debugging, show the full corrected code, not just the fix.
6. For visual projects (websites, games, animations), always include complete working code.
7. Be thorough. Complex projects should have complete, runnable code.
8. When asked for a project, structure your response as:
   - Brief description of what you're building
   - All code files with clear filenames
   - Brief instructions if needed
9. Format code blocks with language identifier and filename comment.
10. For HTML pages that can be previewed, always make them self-contained (inline CSS and JS) unless explicitly told otherwise.`;

// ── Retry with exponential backoff for 429s ────────────────────────────
async function retryWithBackoff(fn, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const isRetryable = e.status === 429 || e.status === 503 || e.status === 500;
      if (!isRetryable || attempt === maxRetries) throw e;
      const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

// Map model IDs to provider configs
function getProviderConfig(modelId, apiKey, apiBase) {
  if (modelId === "openai/custom" && apiBase) {
    return { apiKey, baseURL: apiBase, model: "default" };
  }
  if (modelId.startsWith("deepseek/")) {
    return { apiKey, baseURL: "https://api.deepseek.com", model: modelId.replace("deepseek/", "") };
  }
  if (modelId.startsWith("groq/")) {
    return { apiKey, baseURL: "https://api.groq.com/openai/v1", model: modelId.replace("groq/", "") };
  }
  if (modelId.startsWith("gemini/")) {
    return { apiKey, baseURL: "https://generativelanguage.googleapis.com/v1beta/openai", model: modelId.replace("gemini/", "") };
  }
  if (modelId.startsWith("openrouter/")) {
    return { apiKey, baseURL: "https://openrouter.ai/api/v1", model: modelId.replace("openrouter/", "") };
  }
  // Z.ai / Zhipu GLM models
  if (modelId.startsWith("glm") || modelId.includes("z.ai")) {
    return { apiKey, baseURL: "https://api.z.ai/api/coding/paas/v4", model: modelId };
  }
  return { apiKey, baseURL: "https://api.openai.com/v1", model: modelId };
}

function processMessages(messages) {
  return messages.map(msg => {
    if (msg.role === "system") return { role: "system", content: msg.content };
    if (msg.role === "assistant") return { role: "assistant", content: msg.content };
    // User message - handle images
    if (msg.images && msg.images.length > 0) {
      const parts = [];
      if (msg.content && msg.content !== "(image)") {
        parts.push({ type: "text", text: msg.content });
      }
      msg.images.forEach(url => {
        parts.push({ type: "image_url", image_url: { url } });
      });
      return { role: "user", content: parts };
    }
    return { role: "user", content: msg.content };
  });
}

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { model: modelId, messages, api_key, api_base, temperature, stream } = req.body;
  if (!api_key) return res.status(400).json({ error: "API key is required" });
  if (!messages || !messages.length) return res.status(400).json({ error: "Messages are required" });

  const config = getProviderConfig(modelId, api_key, api_base);
  const processedMessages = processMessages(messages);
  const allMessages = [{ role: "system", content: SYSTEM_PROMPT }, ...processedMessages];

  try {
    const openai = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL });

    if (stream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      try {
        await retryWithBackoff(async () => {
          const response = await openai.chat.completions.create({
            model: config.model,
            messages: allMessages,
            temperature: temperature || 0.7,
            max_tokens: 16384,
            stream: true,
          });

          for await (const chunk of response) {
            const delta = chunk.choices[0]?.delta?.content;
            if (delta) {
              res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
            }
          }
        });
      } catch (e) {
        try { res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`); } catch {}
      }
      res.write("data: [DONE]\n\n");
      return res.end();
    }

    // Non-streaming
    const response = await retryWithBackoff(() =>
      openai.chat.completions.create({
        model: config.model,
        messages: allMessages,
        temperature: temperature || 0.7,
        max_tokens: 16384,
      })
    );
    return res.status(200).json({ content: response.choices[0]?.message?.content || "" });
  } catch (error) {
    const msg = error.error?.message || error.message || "Unknown error";
    const status = error.status || 500;
    return res.status(status).json({ error: msg });
  }
}
