const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

// Token (Render environment variable se)
const token = process.env.BOT_TOKEN || '8695604407:AAFj49OFbTulux5HTG96j16780xIj5HlCus';
const bot = new TelegramBot(token, { polling: true });

// Express server (Render port binding ke liye)
const app = express();
app.get('/', (req, res) => res.send('Bot is running properly!'));
app.get('/health', (req, res) => res.send('OK'));
const port = process.env.PORT || 10000;
app.listen(port, () => console.log(`Web server on port ${port}`));

console.log("Bot is starting...");

// Memory store for active checkouts
const pendingCheckouts = {};

// Helpers
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function validateCard(card) {
    const parts = card.split('|');
    if (parts.length !== 4) return false;
    const [cc, mm, yy, cvv] = parts;
    return (cc.length === 15 || cc.length === 16) && /^\d+$/.test(cc) &&
           mm.length === 2 && /^\d+$/.test(mm) && parseInt(mm) >= 1 && parseInt(mm) <= 12 &&
           (yy.length === 2 || yy.length === 4) && /^\d+$/.test(yy) &&
           (cvv.length === 3 || cvv.length === 4) && /^\d+$/.test(cvv);
}

// /start Command
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const name = msg.from.first_name;
    const id = msg.from.id;

    const welcome = `<b>⌬ @AutoShopifyHitterBot | By @xrucg</b>\n` +
                    `<code>Upgrading...</code>\n` +
                    `━━━━━━━━━━━━━━━━\n` +
                    `✅️ <b>Hello ${name}!</b>\n` +
                    `How Are You?\n` +
                    `👤 <b>Your UserID - ${id}</b>\n` +
                    `<code>BOT Status - Live!!!</code>`;

    const opts = {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [[{ text: "Auto Checkout", callback_data: "auto_checkout" }]]
        }
    };

    bot.sendMessage(chatId, welcome, opts);
});

// Auto Checkout Button Callback
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;

    if (query.data === 'auto_checkout') {
        const info = `【✘】<b>Status</b> : | <code>Live</code>\n\n` +
                     `【✘】<b>Command</b> : <code>/sco</code>\n\n` +
                     `【✘】<b>Gateway</b> : <code>Auto Shopify Hitter</code>`;
                     
        bot.editMessageText(info, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [[{ text: "Back", callback_data: "back" }]]
            }
        });
    } else if (query.data === 'back') {
        const name = query.from.first_name;
        const id = query.from.id;
        const welcome = `<b>⌬ @AutoShopifyHitterBot | By @xrucg</b>\n` +
                        `<code>Upgrading...</code>\n` +
                        `━━━━━━━━━━━━━━━━\n` +
                        `✅️ <b>Hello ${name}!</b>\n` +
                        `How Are You?\n` +
                        `👤 <b>Your UserID - ${id}</b>\n` +
                        `<code>BOT Status - Live!!!</code>`;

        bot.editMessageText(welcome, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [[{ text: "Auto Checkout", callback_data: "auto_checkout" }]]
            }
        });
    }
    bot.answerCallbackQuery(query.id);
});

// /sco Command
bot.onText(/\/sco(.*)/, (msg, match) => {
    const chatId = msg.chat.id;
    const content = match[1].trim();

    if (!content) {
        const usage = `<b>Usage</b> : /sco &lt;checkout_url&gt;\n` +
                      `<i>Or</i>\n` +
                      `<code>/sco &lt;checkout_url&gt;</code> then cards on next lines:\n` +
                      `<code>CC|MM|YY|CVV</code> (one per line, max 25)\n\n` +
                      `Or send URL alone and reply to the bot's message with cards.`;
        return bot.sendMessage(chatId, usage, { parse_mode: 'HTML' });
    }

    const lines = content.split('\n');
    let url = null;
    let cardLines = [];

    for (let line of lines) {
        line = line.trim();
        if (!line) continue;
        if (!url && /^https?:\/\//.test(line)) {
            url = line;
        } else {
            cardLines.push(line);
        }
    }

    if (!url) {
        return bot.sendMessage(chatId, "⚠️ Invalid format. URL missing.", { parse_mode: 'HTML' });
    }

    // Basic URL validation (checking for cart and checkout params)
    if (!url.includes('/cart/') || !url.includes('checkout%5Bshipping_address%5D')) {
        return bot.sendMessage(chatId, "⚠️ Invalid checkout URL structure.", { parse_mode: 'HTML' });
    }

    // Extract domain
    let shop = "Unknown";
    try { shop = new URL(url).hostname; } catch(e){}

    if (cardLines.length > 0) {
        startSession(chatId, msg.message_id, cardLines, shop);
    } else {
        const details = `✅ <b>Checkout Detected</b>\n` +
                        `━━━━━━━━━━━━━━━━\n` +
                        `<b>Shop:</b> <code>${shop}</code>\n\n` +
                        `➡️ Reply to this message with cards (<code>CC|MM|YY|CVV</code>), one per line, max 25.`;
        
        bot.sendMessage(chatId, details, { parse_mode: 'HTML', reply_to_message_id: msg.message_id })
        .then(sentMsg => {
            pendingCheckouts[sentMsg.message_id] = { shop: shop };
        });
    }
});

// Listen for replies to checkout message
bot.on('message', (msg) => {
    if (msg.reply_to_message && pendingCheckouts[msg.reply_to_message.message_id]) {
        const checkoutData = pendingCheckouts[msg.reply_to_message.message_id];
        delete pendingCheckouts[msg.reply_to_message.message_id];
        
        if (msg.text) {
            const cardLines = msg.text.split('\n');
            startSession(msg.chat.id, msg.message_id, cardLines, checkoutData.shop);
        }
    }
});

// Session Runner
async function startSession(chatId, replyToId, rawLines, shop) {
    let cards = [];
    for (let line of rawLines) {
        if (cards.length >= 25) break;
        if (validateCard(line.trim())) cards.push(line.trim());
    }

    if (cards.length === 0) {
        return bot.sendMessage(chatId, "⚠️ No valid cards found.\n\nFormat: <code>CC|MM|YY|CVV</code>", { parse_mode: 'HTML' });
    }

    const total = cards.length;
    let text = `<b>⌬ @AutoShopifyHitterBot | Auto Checkout</b>\n` +
               `<code>Starting checks...</code>\n` +
               `━━━━━━━━━━━━━━━━\n` +
               `<b>Cards Loaded</b> : <code>${total}</code>\n` +
               `<b>Shop</b> : <code>${shop}</code>`;
               
    const statusMsg = await bot.sendMessage(chatId, text, { parse_mode: 'HTML', reply_to_message_id: replyToId });
    const msgId = statusMsg.message_id;

    let checked = 0, declines = 0, three_ds = 0;

    for (let card of cards) {
        // Processing state
        let pText = `<b>⌬ @AutoShopifyHitterBot | Auto Checkout</b>\n` +
                    `<code>Processing...</code>\n` +
                    `━━━━━━━━━━━━━━━━\n` +
                    `<b>Count</b> : <code>Checked ${checked}/${total}</code>\n\n` +
                    `<b>𝗖𝗮𝗿𝗱</b> : <code>${card}</code>\n` +
                    `<b>𝐑𝐞𝐬𝐩𝐨𝐧𝐬𝐞</b> : <code>Checking...</code>\n\n` +
                    `<b>Checkout Status</b> : <code>Incomplete</code>`;
        
        try { await bot.editMessageText(pText, { chat_id: chatId, message_id: msgId, parse_mode: 'HTML' }); } catch(e){}

        // 3-4 sec fake wait
        await sleep(Math.floor(Math.random() * 1000) + 3000);

        let response = "";
        if (Math.random() < 0.70) {
            response = "3DS_Required";
            three_ds++;
        } else {
            response = "Card_Declined";
            declines++;
        }

        checked++;

        // Checked state
        let cText = `<b>⌬ @AutoShopifyHitterBot | Auto Checkout</b>\n` +
                    `<code>Completed</code>\n` +
                    `━━━━━━━━━━━━━━━━\n` +
                    `<b>Count</b> : <code>Checked ${checked}/${total}</code>\n\n` +
                    `<b>𝗖𝗮𝗿𝗱</b> : <code>${card}</code>\n` +
                    `<b>𝐑𝐞𝐬𝐩𝐨𝐧𝐬𝐞</b> : <code>${response}</code>\n\n` +
                    `<b>Checkout Status</b> : <code>Incomplete</code>`;
        
        try { await bot.editMessageText(cText, { chat_id: chatId, message_id: msgId, parse_mode: 'HTML' }); } catch(e){}
    }

    // Final State
    let fText = `<b>⌬ @AutoShopifyHitterBot | Auto Checkout Done</b>\n` +
                `<code>Payment attempts finished</code>\n` +
                `━━━━━━━━━━━━━━━━\n` +
                `<b>Total</b> : <code>${total}</code>\n` +
                `<b>Shop</b> : <code>${shop}</code>\n\n` +
                `❌ <b>Declined</b> : <code>${declines}</code>\n` +
                `🔐 <b>3DS</b> : <code>${three_ds}</code>\n\n` +
                `<b>Checkout Status</b> : <code>Incomplete</code>`;
                
    try { await bot.editMessageText(fText, { chat_id: chatId, message_id: msgId, parse_mode: 'HTML' }); } catch(e){}
       }
