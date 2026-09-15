# NexaVoice Thinnest AI → Telegram (No AI API)

Plug-and-play Render service. Thinnest AI POSTs call data here. A local open-source Hugging Face model runs inside the Render service to extract lead fields, then the server sends the formatted result to Telegram.

## Required Render environment variables
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

No OpenAI, OpenRouter, Pollinations, Hugging Face API key, Ollama, or other AI API key is required.

Optional: `LOCAL_MODEL` (default: `HuggingFaceTB/SmolLM2-360M-Instruct`)

## Thinnest webhook
Use either `https://YOUR-APP.onrender.com/` or `https://YOUR-APP.onrender.com/api/thinnest/call-ended`. Both accept POST. No webhook secret is required.
