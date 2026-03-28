"""
POST /api/chat — Stream chat completion via litellm.
Vercel Serverless Function (Python).
"""

import json


def handler(request):
    """Vercel serverless function handler."""
    try:
        body = json.loads(request.get("body", "{}"))
    except (json.JSONDecodeError, TypeError):
        body = {}

    model = body.get("model", "gpt-4o-mini")
    messages = body.get("messages", [])
    api_key = body.get("api_key")
    api_base = body.get("api_base")
    temperature = body.get("temperature", 0.7)

    if not api_key:
        return {
            "statusCode": 400,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": "API key is required"}),
        }
    if not messages:
        return {
            "statusCode": 400,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": "Messages are required"}),
        }

    # Lazy import litellm so Vercel can parse this file at build time
    import litellm

    SYSTEM_PROMPT = (
        "You are OmniCode, an expert coding assistant. "
        "You help users write, debug, explain, and refactor code. "
        "Always format code with proper markdown code blocks including "
        "the language identifier. Be concise but thorough."
    )

    # Prepend system message
    if messages[0].get("role") != "system":
        messages = [{"role": "system", "content": SYSTEM_PROMPT}] + messages

    # Build kwargs
    kwargs = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "api_key": api_key,
    }
    if api_base:
        kwargs["api_base"] = api_base

    try:
        response = litellm.completion(stream=False, **kwargs)
        content = response.choices[0].message.content or ""

        return {
            "statusCode": 200,
            "headers": {
                "Content-Type": "application/json",
                "Cache-Control": "no-cache",
            },
            "body": json.dumps({"content": content}),
        }
    except Exception as e:
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": f"{type(e).__name__}: {str(e)}"}),
        }
