# NexaVoice Thinnest AI → OpenRouter Free AI → Telegram

Render-ready webhook that accepts Thinnest AI call-ended POSTs, immediately returns HTTP 200, then asynchronously extracts lead information with an OpenRouter free model and sends the formatted result to Telegram.

## Render environment variables

Required:
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `OPENROUTER_API_KEY`

Optional:
- `OPENROUTER_MODEL` (default: `google/gemma-4-26b-a4b-it:free`)
- `APP_URL`

## Webhook

Use either:
- `https://YOUR-APP.onrender.com/`
- `https://YOUR-APP.onrender.com/api/thinnest/call-ended`

The server does not require a webhook secret.

## Behavior

1. Thinnest sends the call payload.
2. Server immediately returns `{ "ok": true, "accepted": true }` so the webhook does not wait for AI.
3. Background processing extracts caller, duration, summary/transcript.
4. OpenRouter runs a free open-weight model.
5. The model returns JSON with priority, name, business, service, budget, timeline, summary.
6. Server formats the exact Telegram message and sends it to the configured chat.

## Privacy

The request asks OpenRouter to route only to providers whose data-collection policy meets `data_collection: deny`, when such an endpoint is available. If no eligible provider can serve the request, processing fails rather than silently relaxing that setting.

## Notes

Free OpenRouter endpoints are free but rate-limited and their availability can change. The application uses a configurable model so you can switch models without changing the webhook.
