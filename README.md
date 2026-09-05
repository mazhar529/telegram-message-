# NexaVoice → VideoSDK Summary → Telegram

## 1. Deploy to Render

Create a new **Web Service** from this project.

Build Command:
npm install

Start Command:
npm start

## 2. Add Render Environment Variables

TELEGRAM_BOT_TOKEN = your Telegram bot token
TELEGRAM_CHAT_ID = your Telegram chat ID

Do not put the bot token in VideoSDK.

## 3. VideoSDK Summary Endpoint URL

After Render deploys, copy the Render HTTPS URL and add:

/api/call-summary

Example:

https://your-service.onrender.com/api/call-summary

## 4. Test health

Open:

https://your-service.onrender.com/

It should return JSON with ok=true.

## Important

The exact JSON structure sent by VideoSDK's Summary Endpoint can vary by the VideoSDK configuration/version. This server accepts common field names and forwards the extracted information to Telegram.

Before production, send one real/test call and inspect the Render logs. If VideoSDK uses different field names, update buildTelegramMessage() to map those exact fields.

## Telegram

The Telegram bot must be able to send messages to the target chat. For a private chat, start the bot first. For a group/channel, add the bot and use the appropriate chat ID/permissions.
