const express = require("express");

const app = express();
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 10000;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Health check endpoint
app.get("/", (_req, res) => {
  res.json({ ok: true, service: "NexaVoice Telegram Summary" });
});

// Call summary / webhook endpoint
app.post("/api/call-summary", async (req, res) => {
  try {
    const payload = req.body || {};

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
  if (value === "-") return "-";
  if (typeof value === "number") {
    const seconds = Math.max(0, Math.round(value));
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  }
  return String(value);
}

function buildTelegramMessage(p) {
  const priority = clean(firstValue(p, [
    "priority", "data.priority", "summary.priority", "variables.priority", "result.priority"
  ]));

  const caller = clean(firstValue(p, [
    "caller", "caller_number", "callerNumber", "phoneNumber", "phone", "fromPhone",
    "data.caller", "data.caller_number", "metadata.caller_number", "metadata.fromPhone"
  ]));

  const duration = formatDuration(firstValue(p, [
    "duration", "call_duration", "callDuration",
    "data.duration", "data.call_duration", "metadata.duration"
  ]));

  const name = clean(firstValue(p, [
    "name", "customer_name", "customerName",
    "summary.customer_name", "variables.name", "data.name"
  ]));

  const business = clean(firstValue(p, [
    "business", "business_name", "businessName", "company",
    "summary.business_name", "variables.business", "data.business"
  ]));

  const service = clean(firstValue(p, [
    "service", "service_required", "serviceRequired",
    "summary.service_required", "variables.service", "data.service"
  ]));

  const budget = clean(firstValue(p, [
    "budget", "customer_budget", "summary.budget", "variables.budget", "data.budget"
  ]));

  const timeline = clean(firstValue(p, [
    "timeline", "customer_timeline", "summary.timeline", "variables.timeline", "data.timeline"
  ]));

  const summary = clean(firstValue(p, [
    "summary", "call_summary", "summary_text",
    "data.call_summary", "data.summary", "result.summary"
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
