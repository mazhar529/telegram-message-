# NexaVoice / Thinnest AI → Private AI → Telegram

This version is designed for your flow:

THINNEST AI CALL → webhook → LOCAL OPEN-SOURCE AI (Ollama) → structured lead data → Telegram bot

## Why local Ollama

Caller phone numbers, names, business information, budgets and call transcripts can be sensitive. The default setup keeps the extraction model on infrastructure you control instead of sending the call payload to a third-party AI API.

Ollama supports JSON-schema structured outputs, which makes the extraction more reliable than asking a model for free-form text.

## 1. Run Ollama on the same private server

Install Ollama and pull a model. Example:

```bash
ollama pull gpt-oss:20b
```

For a smaller machine, choose a smaller compatible open model and set `OLLAMA_MODEL` accordingly.

Make sure Ollama is reachable at:

```text
http://127.0.0.1:11434
```

## 2. Install this Node service

```bash
npm install
npm start
```

## 3. Environment variables

Copy `.env.example` to `.env` and set:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `THINNEST_WEBHOOK_SECRET`
- `OLLAMA_URL`
- `OLLAMA_MODEL`

Never put the Telegram bot token inside Thinnest AI.

## 4. Thinnest AI endpoint

Configure Thinnest AI to POST the call-ended data to:

```text
https://YOUR-DOMAIN/api/thinnest/call-ended
```

Send this header:

```text
x-thinnest-webhook-secret: YOUR_SECRET
```

The endpoint accepts the complete JSON payload from Thinnest AI. The local model reads the payload and extracts the fields.

## 5. Telegram result

The bot sends:

🟢 NexaVoice Call Ended — Priority: Low

📞 Caller: ...
⏱️ Duration: ...
👤 Name: ...
🏢 Business: ...
🛠️ Service: ...
💰 Budget: ...
📅 Timeline: ...

📝 Summary: ...

Priority is automatically normalized to High / Medium / Low by the model.

## Important privacy note

Do not use a random free hosted AI endpoint for caller PII just because it is free. If privacy is important, keep Ollama on the same private server/VPS as this webhook. Pollinations supports open/community models, but its current documentation explicitly says community models run on their owners' infrastructure and request content is sent to that upstream provider. That makes a self-hosted Ollama model the safer default for sensitive lead data.
