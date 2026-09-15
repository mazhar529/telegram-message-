# NexaVoice Thinnest AI → Telegram (No AI API)

Render-ready webhook application. It receives Thinnest AI call data, immediately returns HTTP 200, then processes the lead in the background using a local open-source Hugging Face model via Transformers.js and sends the structured lead to Telegram.

## Required Render environment variables
- `TELEGRAM_BOT_TOKEN` — your Telegram bot token
- `TELEGRAM_CHAT_ID` — chat/group/channel ID where notifications should be sent

Optional:
- `LOCAL_MODEL` — defaults to `HuggingFaceTB/SmolLM2-360M-Instruct`

No OpenAI, OpenRouter, Pollinations, Hugging Face API key, Ollama, or webhook secret is required.

## Thinnest webhook
Use either:
- `https://YOUR-RENDER-SERVICE.onrender.com/`
- `https://YOUR-RENDER-SERVICE.onrender.com/api/thinnest/call-ended`

The server acknowledges the webhook immediately and performs AI extraction in the background, avoiding Thinnest timeout while the local model loads.

## Health
GET `/health` returns `{ "ok": true }`.
