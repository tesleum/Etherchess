
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const bodyParser = require('body-parser');
const https = require('https');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const PORT = process.env.PORT || 3700;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8358429211:AAFJuK1PpDKPexyDN-f_eY2UPvzIPwWTX8M';
const BACKEND_URL = "https://botchess.tesleum.com";
const APP_URL = "https://chess.tesleum.com";
const BOT_USERNAME = "EtherChessBot";

app.use(cors());
app.use(bodyParser.json());

// Create HTTP Server
const server = http.createServer(app);

// Initialize WebSocket Server
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => ws.isAlive = true);

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            // Broadcast the message to all connected clients
            // In a production app, you would filter by roomId (lobby vs specific game)
            wss.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(data));
                }
            });
        } catch (e) {
            console.error('WS Error:', e);
        }
    });
});

// Heartbeat to keep connections alive
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => clearInterval(interval));

// Helper to verify Telegram Data
const verifyTelegramData = (data) => {
    const { hash, ...userData } = data;
    if (!hash) return false;

    const dataCheckString = Object.keys(userData)
        .sort()
        .map(key => `${key}=${userData[key]}`)
        .join('\n');

    const secretKey = crypto.createHash('sha256').update(BOT_TOKEN).digest();
    const hmac = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    return hmac === hash;
};

// Helper to send Telegram messages
const sendTelegramMessage = (chatId, text, replyMarkup) => {
    const data = JSON.stringify({
        chat_id: chatId,
        text: text,
        reply_markup: replyMarkup,
        parse_mode: 'Markdown'
    });

    const options = {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${BOT_TOKEN}/sendMessage`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length
        }
    };

    const req = https.request(options, (res) => {
        res.on('data', () => {}); // Consume stream
    });

    req.on('error', (error) => {
        console.error('Error sending Telegram message:', error);
    });

    req.write(data);
    req.end();
};

// --- ROUTES ---

// Auth Endpoint
app.post(BACKEND_URL+'/auth/telegram', (req, res) => {
    const userData = req.body;
    const isValid = verifyTelegramData(userData);
    
    if (isValid) {
        res.json({ success: true, user: userData });
    } else {
        res.status(403).json({ error: 'Invalid authentication signature' });
    }
});

// Referral Endpoint
app.post(BACKEND_URL+'/api/referral', (req, res) => {
    const { referrerId, newUserId } = req.body;
    console.log(`Referral: ${referrerId} invited ${newUserId}`);
    res.json({ success: true });
});

// Challenge Notification Endpoint
app.post(BACKEND_URL+'/api/challenge-notify', (req, res) => {
    const { chatId, text } = req.body;
    
    if (!chatId || !text) {
        return res.status(400).json({ error: "Missing parameters" });
    }

    // Send simple notification
    sendTelegramMessage(chatId, text);
    
    res.json({ success: true });
});

// Telegram Webhook Handler
app.post(BACKEND_URL+`/bot${BOT_TOKEN}`, (req, res) => {
    const update = req.body;

    if (update.message && update.message.text) {
        const chatId = update.message.chat.id;
        const text = update.message.text;

        // Handle /start command
        if (text.startsWith('/start')) {
            const args = text.split(' ')[1]; // Extract start parameter (e.g. referral code)
            
            // Construct Web App URL with parameters
            let webAppUrl = APP_URL;
            if (args) {
                webAppUrl += `?start=${args}`;
            }

            const message = `👑 *Welcome to ETHERCHESS AI*\n\nThe advanced chess platform on TON.\n\n♟️ *Play* vs AI or PvP\n🏆 *Rank* up on the leaderboard\n💰 *Earn* rewards\n\nClick below to start playing!`;

            const replyMarkup = {
                inline_keyboard: [
                    [{ text: "♟️ Play Now", web_app: { url: webAppUrl } }],
                    [{ text: "🌐 Community", url: "https://t.me/usGOLDus" }]
                ]
            };

            sendTelegramMessage(chatId, message, replyMarkup);
        }
    }

    // Always return 200 OK to Telegram
    res.sendStatus(200);
});

// Start Server (using the HTTP server wrapper which includes WS)
server.listen(PORT, () => {
    console.log(`Server running on ${PORT}`);
    
    // Set Webhook
    const webhookUrl = `${BACKEND_URL}/bot${BOT_TOKEN}`;
    const setWebhookUrl = `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${webhookUrl}`;
    
    https.get(setWebhookUrl, (res) => {
        console.log(`Setting webhook to: ${webhookUrl}`);
    }).on('error', (e) => {
        console.error('Error setting webhook:', e);
    });
});
