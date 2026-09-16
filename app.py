import os
import html
import requests
from flask import Flask, request, jsonify

app = Flask(__name__)

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")
TELEGRAM_URL = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"


def first(data, *keys, default="-"):
    for key in keys:
        value = data.get(key)
        if value is not None and value != "":
            return value
    return default


def clean(value):
    return html.escape(str(value))


def send_telegram(message):
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        raise RuntimeError("Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID environment variable.")

    response = requests.post(
        TELEGRAM_URL,
        json={
            "chat_id": TELEGRAM_CHAT_ID,
            "text": message,
            "parse_mode": "HTML",
            "disable_web_page_preview": True,
        },
        timeout=20,
    )
    response.raise_for_status()
    return response.json()


@app.get("/")
def health():
    return jsonify({
        "status": "online",
        "service": "RingReady -> Telegram webhook"
    })


@app.get("/health")
def health_check():
    return jsonify({"ok": True})


@app.post("/webhook")
def webhook():
    try:
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            return jsonify({"success": False, "error": "Expected a JSON object"}), 400

        caller = first(data, "caller", "phone", "phone_number", "from", "caller_number")
        name = first(data, "name", "caller_name", "full_name")
        duration = first(data, "duration", "call_duration")
        priority = first(data, "priority", "lead_priority")
        business = first(data, "business", "company", "business_name")
        service = first(data, "service", "required_service", "interest")
        budget = first(data, "budget")
        timeline = first(data, "timeline")
        summary = first(data, "summary", "call_summary")
        transcript = first(data, "transcript", "call_transcript")

        # Keep Telegram messages readable and avoid excessively large payloads.
        if len(str(transcript)) > 7000:
            transcript = str(transcript)[:7000] + "\n...[truncated]"

        message = (
            "<b>🟢 RingReady Call Ended</b>\n\n"
            f"<b>Priority:</b> {clean(priority)}\n"
            f"📞 <b>Caller:</b> {clean(caller)}\n"
            f"⏱️ <b>Duration:</b> {clean(duration)}\n"
            f"👤 <b>Name:</b> {clean(name)}\n"
            f"🏢 <b>Business:</b> {clean(business)}\n"
            f"🛠️ <b>Service:</b> {clean(service)}\n"
            f"💰 <b>Budget:</b> {clean(budget)}\n"
            f"📅 <b>Timeline:</b> {clean(timeline)}\n\n"
            f"📝 <b>Summary:</b>\n{clean(summary)}"
        )

        # Include transcript only when RingReady sends one.
        if transcript != "-":
            message += f"\n\n📄 <b>Transcript:</b>\n{clean(transcript)}"

        telegram_result = send_telegram(message)

        return jsonify({
            "success": True,
            "telegram_sent": True,
            "telegram_result": telegram_result,
        }), 200

    except requests.RequestException as exc:
        return jsonify({
            "success": False,
            "telegram_sent": False,
            "error": f"Telegram API error: {exc}",
        }), 502
    except Exception as exc:
        return jsonify({
            "success": False,
            "telegram_sent": False,
            "error": str(exc),
        }), 500


if __name__ == "__main__":
    port = int(os.getenv("PORT", "10000"))
    app.run(host="0.0.0.0", port=port)
