"""
GET /api/models — Return curated model list.
Vercel Serverless Function (Python).
"""

models_data = {
    "models": [
        # OpenAI
        {"id": "gpt-4o", "name": "GPT-4o", "provider": "openai"},
        {"id": "gpt-4o-mini", "name": "GPT-4o Mini", "provider": "openai"},
        {"id": "gpt-4-turbo", "name": "GPT-4 Turbo", "provider": "openai"},
        {"id": "o3-mini", "name": "o3 Mini", "provider": "openai"},
        # Anthropic
        {"id": "claude-sonnet-4-20250514", "name": "Claude Sonnet 4", "provider": "anthropic"},
        {"id": "claude-3-5-sonnet-20241022", "name": "Claude 3.5 Sonnet", "provider": "anthropic"},
        {"id": "claude-3-5-haiku-20241022", "name": "Claude 3.5 Haiku", "provider": "anthropic"},
        # Google
        {"id": "gemini/gemini-2.0-flash", "name": "Gemini 2.0 Flash", "provider": "google"},
        {"id": "gemini/gemini-1.5-pro", "name": "Gemini 1.5 Pro", "provider": "google"},
        # DeepSeek
        {"id": "deepseek/deepseek-chat", "name": "DeepSeek V3", "provider": "deepseek"},
        {"id": "deepseek/deepseek-reasoner", "name": "DeepSeek R1", "provider": "deepseek"},
        # Groq
        {"id": "groq/llama-3.3-70b-versatile", "name": "Llama 3.3 70B (Groq)", "provider": "groq"},
        # OpenRouter
        {"id": "openrouter/meta-llama/llama-3.1-405b-instruct", "name": "Llama 3.1 405B (OpenRouter)", "provider": "openrouter"},
        # Custom
        {"id": "openai/custom", "name": "Custom (OpenAI-compatible)", "provider": "custom"},
    ]
}


def handler(request):
    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": __import__("json").dumps(models_data),
    }
