# RDN AI

A no-authentication AI chat application with local conversation persistence.

## Run locally

1. Install Node.js 18+.
2. Open this folder in a terminal.
3. Run:

```bash
npm install
```

4. Copy `.env.example` to `.env`.
5. Fill in:

```env
AI_API_URL=
AI_API_KEY=
AI_MODEL=
```

6. Start:

```bash
npm start
```

7. Open `http://localhost:3000`.

The frontend never receives the AI API key. Conversations are stored locally in the browser.

## API compatibility

The included server expects an OpenAI-compatible chat-completions endpoint. If your provider has a different API format, modify `server.js` in the `/api/chat` route.
