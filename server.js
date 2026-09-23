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

app.post("/api/chat", async (req, res) => {
  const { messages, model } = req.body || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "No messages supplied." });
  }

  if (!process.env.AI_API_KEY || !process.env.AI_API_URL || !process.env.AI_MODEL) {
    return res.status(503).json({
      error: "AI is not configured. Add AI_API_KEY, AI_API_URL and AI_MODEL to .env."
    });
  }

  try {
    const response = await fetch(process.env.AI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.AI_API_KEY}`
      },
      body: JSON.stringify({
        model: model || process.env.AI_MODEL,
        messages,
        temperature: 0.7,
        stream: false
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("AI provider error:", data);
      return res.status(response.status).json({
        error: data?.error?.message || "The AI provider returned an error."
      });
    }

    const content =
      data?.choices?.[0]?.message?.content ??
      data?.choices?.[0]?.text ??
      "";

    if (!content) {
      return res.status(502).json({ error: "The AI provider returned an empty response." });
    }

    res.json({ content });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not connect to the AI provider." });
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(port, () => {
  console.log(`RDN AI running at http://localhost:${port}`);
});