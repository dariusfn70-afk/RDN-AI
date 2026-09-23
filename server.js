import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

const MODEL_MAP = {
  default: process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
  fast: "gemini-3.5-flash-lite",
  reasoning: "gemini-3.8-flash"
};

app.post("/api/chat", async (req, res) => {
  const { messages, model } = req.body || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "No messages supplied." });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json({
      error: "Gemini is not configured. Add GEMINI_API_KEY in Render Environment."
    });
  }

  const selectedModel = MODEL_MAP[model] || MODEL_MAP.default;
  const systemMessage = messages.find((m) => m?.role === "system");
  const contents = messages
    .filter((m) => m?.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m.content ?? "") }]
    }));

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY
        },
        body: JSON.stringify({
          ...(systemMessage?.content
            ? { systemInstruction: { parts: [{ text: String(systemMessage.content) }] } }
            : {}),
          contents,
          generationConfig: {
            temperature: 0.7
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini error:", data);
      return res.status(response.status).json({
        error: data?.error?.message || "Gemini returned an error."
      });
    }

    const content = data?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("")
      .trim();

    if (!content) {
      return res.status(502).json({ error: "Gemini returned an empty response." });
    }

    res.json({ content });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not connect to Gemini." });
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(port, "0.0.0.0", () => {
  console.log(`RDN AI running on port ${port}`);
});
