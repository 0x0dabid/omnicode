# OmniCode — Multi-LLM Coding Assistant

A web-based coding assistant (like Claude Code) that lets you use **any LLM** via API key.

## Features

- Multiple LLM providers: OpenAI, Anthropic, Google, DeepSeek, Groq, OpenRouter, and custom endpoints
- Real-time streaming responses
- Markdown rendering with syntax-highlighted code blocks
- Copy code button on every code block
- Settings saved in browser localStorage
- Clean, dark terminal-style UI
- No build step — just Python + vanilla JS

## Quick Start

```bash
# Install dependencies
pip install fastapi uvicorn litellm python-dotenv

# Run the server
python main.py

# Open in browser
# http://localhost:8000
```

## Usage

1. Open http://localhost:8000 in your browser
2. Click the gear icon (top right)
3. Enter your API key for the provider you want to use
4. Optionally set a custom API base URL (for self-hosted models)
5. Select your model from the dropdown
6. Start chatting!

## Supported Providers

| Provider   | Models                                       |
|------------|----------------------------------------------|
| OpenAI     | GPT-4o, GPT-4o Mini, GPT-4 Turbo, o3 Mini   |
| Anthropic  | Claude Sonnet 4, Claude 3.5 Sonnet/Haiku     |
| Google     | Gemini 2.0 Flash, Gemini 1.5 Pro             |
| DeepSeek   | DeepSeek V3, DeepSeek R1                     |
| Groq       | Llama 3.3 70B                                |
| OpenRouter | Llama 3.1 405B                               |
| Custom     | Any OpenAI-compatible endpoint               |

## Project Structure

```
omnicode/
├── main.py              # FastAPI backend
├── requirements.txt     # Python dependencies
├── static/
│   ├── index.html       # Main UI
│   ├── style.css        # Custom styles
│   └── app.js           # Frontend logic
└── README.md
```

## Options

```bash
python main.py --host 0.0.0.0 --port 8000 --reload
```

- `--host` — Bind address (default: 0.0.0.0)
- `--port` — Port number (default: 8000)
- `--reload` — Enable auto-reload for development

## License

MIT
