const express = require("express");

const app = express();
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 10000;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Health check
app.get("/", (_req, res) => {
  res.json({ ok: true, service: "NexaVoice Telegram Summary" });
});

// VideoSDK Summary Endpoint
app.post("/api/call-summary", async (req, res) => {
  try {
    const payload = req.body || {};

    // VideoSDK payloads can differ by configuration/version.
    // Prefer a summary string if supplied; otherwise serialize the
    // most useful recognizable fields and let the fallback formatter work.
    const message = buildTelegramMessage(payload);

    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      console.error("Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID");
      return res.status(500).json({ ok: false, error: "Telegram environment variables are missing" });
    }

    const telegramResponse = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: message
        })
      }
    );

    const telegramData = await telegramResponse.json();

    if (!telegramResponse.ok || !telegramData.ok) {
      console.error("Telegram error:", telegramData);
      return res.status(502).json({ ok: false, error: "Telegram send failed", details: telegramData });
    }

    return res.status(200).json({ ok: true, telegram_message_id: telegramData.result?.message_id });
  } catch (error) {
    console.error("Summary endpoint error:", error);
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

function firstValue(obj, paths) {
  for (const path of paths) {
    let value = obj;
    for (const key of path.split(".")) {
      if (value == null) break;
      value = value[key];
    }
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return "-";
}

function clean(value) {
  if (value === undefined || value === null || String(value).trim() === "") return "-";
  return String(value).trim();
}

function formatDuration(value) {
  if (value === "-" ) return "-";
  if (typeof value === "number") {
    const seconds = Math.max(0, Math.round(value));
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  }
  return String(value);
}

function buildTelegramMessage(p) {
  const priority = clean(firstValue(p, [
    "priority", "summary.priority", "data.priority", "result.priority"
  ]));

  const caller = clean(firstValue(p, [
    "caller_number", "callerNumber", "phoneNumber", "phone",
    "data.caller_number", "data.callerNumber", "metadata.caller_number"
  ]));

  const duration = formatDuration(firstValue(p, [
    "call_duration", "callDuration", "duration",
    "data.call_duration", "data.callDuration", "metadata.duration"
  ]));

  const name = clean(firstValue(p, [
    "customer_name", "customerName", "name",
    "summary.customer_name", "summary.customerName",
    "data.customer_name", "data.customerName"
  ]));

  const business = clean(firstValue(p, [
    "business_name", "businessName", "company", "business",
    "summary.business_name", "summary.businessName",
    "data.business_name", "data.businessName"
  ]));

  const service = clean(firstValue(p, [
    "service_required", "serviceRequired", "service",
    "summary.service_required", "summary.serviceRequired",
    "data.service_required", "data.serviceRequired"
  ]));

  const budget = clean(firstValue(p, [
    "budget", "customer_budget",
    "summary.budget", "data.budget"
  ]));

  const timeline = clean(firstValue(p, [
    "timeline", "customer_timeline",
    "summary.timeline", "data.timeline"
  ]));

  const summary = clean(firstValue(p, [
    "call_summary", "summary_text", "summary",
    "data.call_summary", "data.summary",
    "result.summary"
  ]));

  const finalPriority = ["High", "Medium", "Low"].includes(priority) ? priority : "Low";
  const icon = finalPriority === "High" ? "🔴" : finalPriority === "Medium" ? "🟡" : "🟢";

  return `${icon} NexaVoice Call Ended — Priority: ${finalPriority}

📞 Caller: ${caller}
⏱️ Duration: ${duration}
👤 Name: ${name}
🏢 Business: ${business}
🛠️ Service: ${service}
💰 Budget: ${budget}
📅 Timeline: ${timeline}

📝 Summary: ${summary}`;
}

app.listen(PORT, () => {
  console.log(`NexaVoice Telegram Summary listening on port ${PORT}`);
});
