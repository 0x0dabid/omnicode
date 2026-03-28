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

// Map litellm-style model IDs to OpenAI-compatible API endpoints
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
  if (modelId.startsWith("claude")) {
    return { apiKey, baseURL: "https://api.anthropic.com/v1", model: modelId, isAnthropic: true };
  }
  if (modelId.startsWith("glm")) {
    return { apiKey, baseURL: "https://api.z.ai/api/coding/paas/v4", model: modelId };
  }
  return { apiKey, baseURL: apiBase || "https://api.openai.com/v1", model: modelId };
}

function processMessages(messages, hasImages) {
  // If no images, return as-is
  if (!hasImages) return messages;

  return messages.map(msg => {
    if (msg.images && msg.images.length > 0) {
      const content = [
        { type: "text", text: msg.content },
        ...msg.images.map(url => ({
          type: "image_url",
          image_url: { url, detail: "auto" }
        }))
      ];
      return { role: msg.role, content };
    }
    return { role: msg.role, content: msg.content };
  });
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

  const { model: modelId, messages, api_key, api_base, temperature, stream } = req.body;

  if (!api_key) return res.status(400).json({ error: "API key is required" });
  if (!messages || !messages.length) return res.status(400).json({ error: "Messages are required" });

  const config = getProviderConfig(modelId, api_key, api_base);

  // Check if any message has images
  const hasImages = messages.some(m => m.images && m.images.length > 0);

  // Process messages for multimodal
  const processedMessages = processMessages(messages, hasImages);

  // Prepend system message
  let allMessages = processedMessages;
  if (processedMessages[0].role !== "system") {
    allMessages = [{ role: "system", content: SYSTEM_PROMPT }, ...processedMessages];
  }

  try {
    // Anthropic
    if (config.isAnthropic) {
      const anthropicMessages = messages.map(m => {
        if (m.images && m.images.length > 0) {
          const content = [
            { type: "text", text: m.content },
            ...m.images.map(url => ({
              type: "image",
              source: { type: "url", url }
            }))
          ];
          return { role: m.role === "system" ? "user" : m.role, content };
        }
        return { role: m.role === "system" ? "user" : m.role, content: m.content };
      });

      if (stream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

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
            max_tokens: 16384,
            stream: true,
            system: SYSTEM_PROMPT,
            messages: anthropicMessages,
            temperature: temperature || 0.7,
          }),
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const data = line.slice(6).trim();
                if (data === "[DONE]") continue;
                try {
                  const parsed = JSON.parse(data);
                  if (parsed.type === "content_block_delta" && parsed.delta?.text) {
                    res.write(`data: ${JSON.stringify({ content: parsed.delta.text })}\n\n`);
                  }
                } catch {}
              }
            }
          }
        } catch {}
        res.write("data: [DONE]\n\n");
        return res.end();
      }

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
          max_tokens: 16384,
          system: SYSTEM_PROMPT,
          messages: anthropicMessages,
          temperature: temperature || 0.7,
        }),
      });

      const data = await response.json();
      if (data.error) return res.status(500).json({ error: data.error.message || JSON.stringify(data.error) });
      return res.status(200).json({ content: data.content?.[0]?.text || "" });
    }

    // OpenAI-compatible providers
    const openai = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL });

    if (stream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      try {
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
      } catch (e) {
        try { res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`); } catch {}
      }
      res.write("data: [DONE]\n\n");
      return res.end();
    }

    const response = await openai.chat.completions.create({
      model: config.model,
      messages: allMessages,
      temperature: temperature || 0.7,
      max_tokens: 16384,
    });

    return res.status(200).json({ content: response.choices[0]?.message?.content || "" });
  } catch (error) {
    const msg = error.error?.message || error.message || "Unknown error";
    return res.status(500).json({ error: msg });
  }
}
