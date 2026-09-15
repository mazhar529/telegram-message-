# NexaVoice — Thinnest AI → Free/Open AI → Telegram

## Render setup

1. Create a Render Web Service from this folder/repository.
2. Build command: `npm install`
3. Start command: `npm start`
4. Add these Environment Variables in Render:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`
   - `OPENROUTER_API_KEY`
   - `OPENROUTER_MODEL` = `openrouter/free`
   - `WEBHOOK_SECRET` = any long random secret
5. Deploy.
6. Copy:
   `https://YOUR-RENDER-SERVICE.onrender.com/api/thinnest/call-ended`
7. Put that URL into the Thinnest AI webhook/endpoint.
8. If Thinnest lets you send a secret/header, send:
   `x-webhook-secret: YOUR_WEBHOOK_SECRET`

The app accepts JSON POST bodies and recursively searches common Thinnest/call payload locations for:
- caller/phone
- duration
- transcript
- summary
- name
- business/company
- service
- budget
- timeline
- priority

If a transcript is available, the AI extracts the fields into strict JSON. Missing information becomes `-`.

## Important

OpenRouter's `openrouter/free` is free but subject to provider/model availability and rate limits. It is not an unlimited guarantee.

The application itself has no database and no local AI server. The only required external services are Render, OpenRouter, and Telegram.
