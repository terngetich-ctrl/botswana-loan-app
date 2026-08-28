# Telegram backend webhook integration (example)

This branch adds a simple Express backend (server.js) that:

- Sends Telegram messages with inline keyboards when the frontend starts a verification stage.
- Receives Telegram `callback_query` updates at `/telegram-webhook` and updates an in-memory session map.
- Exposes `/api/status/:sessionId` so the frontend can poll for reviewer decisions.

It also includes `webhook-client.js`, a small client-side override that routes the existing in-browser `sendToTelegramBot(...)` calls through the backend (so the bot token is not exposed in the browser).

Usage

1. Install dependencies on the server:

   ```bash
   npm install express body-parser axios cors uuid dotenv
   ```

2. Create a `.env` file (or set environment variables) with:

   ```env
   TELEGRAM_BOT_TOKEN=123:ABC...
   TELEGRAM_CHAT_ID=987654321   # optional: can be passed from client
   PORT=3000
   ```

3. Run the server locally:

   ```bash
   node server.js
   ```

4. Expose your local server for Telegram (development) using ngrok:

   ```bash
   ngrok http 3000
   ```

5. Set the Telegram webhook to your server URL:

   ```bash
   curl "https://api.telegram.org/bot<YOUR_TOKEN>/setWebhook?url=https://<your-server>/telegram-webhook"
   ```

6. Update the frontend:

   - Remove the `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` from client-side code (index.html).
   - Include `webhook-client.js` in `index.html` just before `</body>`:

   ```html
   <script src="/webhook-client.js"></script>
   </body>
   ```

   The script overrides the existing `sendToTelegramBot` function so the frontend will call the backend instead of talking directly to Telegram.

Notes

- Current server uses in-memory storage (`Map`) for sessions. For production, replace with a persistent store (Redis, Postgres).
- Secure the webhook endpoint using Telegram's `secret_token` or validate incoming requests.
- Do not commit bot tokens into source control.
