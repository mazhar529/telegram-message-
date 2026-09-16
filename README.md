# RingReady -> Telegram Webhook

A small Flask webhook that receives JSON POST requests from a RingReady AI agent and forwards the call information to Telegram.

## Files

- `app.py` - webhook + Telegram forwarding
- `requirements.txt` - Python dependencies
- `Procfile` - Render start command
- `render.yaml` - optional Render Blueprint configuration
- `.env.example` - environment variable template
- `.gitignore` - prevents secrets/cache files from being committed

## Run locally

Windows:

```bash
py -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
set TELEGRAM_BOT_TOKEN=YOUR_BOT_TOKEN
set TELEGRAM_CHAT_ID=YOUR_CHAT_ID
python app.py
```

The webhook will be available at:

`http://127.0.0.1:10000/webhook`

## Deploy to Render

1. Put these files in a GitHub repository.
2. In Render, create a new Web Service from the repository.
3. Build command:

```bash
pip install -r requirements.txt
```

4. Start command:

```bash
gunicorn --bind 0.0.0.0:$PORT app:app
```

5. Add Environment Variables:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

6. Deploy.

Your webhook URL will be:

`https://YOUR-RENDER-SERVICE.onrender.com/webhook`

## Telegram setup

1. Open Telegram and message `@BotFather`.
2. Create a bot with `/newbot`.
3. Copy the bot token into `TELEGRAM_BOT_TOKEN`.
4. Start a chat with your bot (or add it to your target group).
5. Get the target chat ID and put it in `TELEGRAM_CHAT_ID`.

## Test

After deployment, open:

`https://YOUR-RENDER-SERVICE.onrender.com/health`

You should receive:

```json
{"ok":true}
```

Test the webhook with JSON like:

```json
{
  "caller": "+15551234567",
  "name": "John",
  "duration": "02:14",
  "priority": "High",
  "business": "Example LLC",
  "service": "AI receptionist",
  "budget": "$500",
  "timeline": "This month",
  "summary": "Caller wants an AI receptionist and requested a demo.",
  "transcript": "Hello, I am interested in..."
}
```

POST it to:

`https://YOUR-RENDER-SERVICE.onrender.com/webhook`

## Important RingReady note

The app accepts several common field names, but RingReady's exact webhook payload may use different names or nesting.

If RingReady sends a different JSON structure, update the field extraction in `app.py` to match RingReady's actual payload.

Do not put your Telegram bot token in `app.py`, GitHub, or the RingReady prompt. Keep it in Render Environment Variables.
