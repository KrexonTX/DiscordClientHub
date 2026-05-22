const { Client } = require('discord.js-selfbot-v13');
const fs = require('fs');
const path = require('path');
const express = require('express');
const http = require('http');
const https = require('https');
const { Server: SocketIO } = require('socket.io');
const readline = require('readline');

// -----------------------
//  GLOBAL ERROR HANDLERS
// -----------------------
process.on('unhandledRejection', (err) => logToConsole('warn', 'GLOBAL', `Unhandled rejection: ${err?.message || err}`));
process.on('uncaughtException', (err) => logToConsole('warn', 'GLOBAL', `Uncaught exception: ${err?.message || err}`));

// -----------------------
//  CONSOLE LOG INTERCEPTOR
// -----------------------
const consoleLogs = [];
const MAX_LOGS = 500;
let io = null;

function logToConsole(level, bot, msg) {
    const entry = { time: new Date().toISOString(), level, bot, msg };
    consoleLogs.push(entry);
    if (consoleLogs.length > MAX_LOGS) consoleLogs.shift();
    const prefix = `[${entry.time.slice(11, 19)}] [${bot}]`;
    if (level === 'error') console.error(`❌ ${prefix} ${msg}`);
    else if (level === 'warn') console.warn(`⚠️  ${prefix} ${msg}`);
    else console.log(`${prefix} ${msg}`);
    if (io) io.to('authed').emit('consoleLog', entry);
}

// ----------------------------------------------
//  DIRECT DISCORD API — FRIEND REQUEST
//  Bypasses the library's method which triggers
//  "Risky action" captcha challenges by sending
//  proper client-mimicking headers.
// ----------------------------------------------
function sendFriendRequestAPI(client, userId) {
    return new Promise((resolve, reject) => {
        const token = client.token;
        if (!token) return reject(new Error('Client not logged in'));

        const superProps = Buffer.from(JSON.stringify({
            os: 'Windows',
            browser: 'Discord Client',
            release_channel: 'stable',
            client_version: '1.0.9163',
            os_version: '10.0.22631',
            os_arch: 'x64',
            app_arch: 'x64',
            system_locale: 'en-US',
            browser_user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) discord/1.0.9163 Chrome/124.0.6367.243 Electron/30.4.0 Safari/537.36',
            browser_version: '30.4.0',
            client_build_number: 335572,
            native_build_number: 54689,
            client_event_source: null
        })).toString('base64');

        const contextProps = Buffer.from(JSON.stringify({
            location: 'Friends',
            location_guild_id: null,
            location_channel_id: null,
            location_channel_type: null
        })).toString('base64');

        const body = JSON.stringify({});

        const options = {
            hostname: 'discord.com',
            port: 443,
            path: `/api/v9/users/@me/relationships/${userId}`,
            method: 'PUT',
            headers: {
                'Authorization': token,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) discord/1.0.9163 Chrome/124.0.6367.243 Electron/30.4.0 Safari/537.36',
                'X-Super-Properties': superProps,
                'X-Context-Properties': contextProps,
                'Origin': 'https://discord.com',
                'Referer': 'https://discord.com/channels/@me',
                'X-Discord-Locale': 'en-US',
                'X-Discord-Timezone': 'Europe/London',
                'X-Debug-Options': 'bugReporterEnabled',
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 204 || res.statusCode === 200) {
                    return resolve();
                }
                try {
                    const json = JSON.parse(data);
                    reject(new Error(json.message || `HTTP ${res.statusCode}`));
                } catch {
                    reject(new Error(`HTTP ${res.statusCode}`));
                }
            });
        });

        req.on('error', (err) => reject(err));
        req.write(body);
        req.end();
    });
}
// -----------------------
//  LOAD & SAVE CONFIG
// -----------------------
const CONFIG_PATH = path.join(__dirname, 'config.json');

if (!fs.existsSync(CONFIG_PATH)) { console.error('❌ config.json not found!'); process.exit(1); }

let config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
let configChanged = false;
if (config.bots && Array.isArray(config.bots)) {
    config.bots.forEach(bot => {
        if (!bot.configId) {
            bot.configId = 'cfg_' + Math.random().toString(36).substring(2, 11);
            configChanged = true;
        }
    });
}
if (configChanged) {
    try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    } catch (err) {
        console.error('⚠️ Failed to save config with generated configIds:', err.message);
    }
}
const OWNER_ID = config.owner_id;
const WEB_PORT = config.web_port || 3000;
const WEB_PASSWORD = config.web_password || 'changeme';

if (!OWNER_ID) { console.error('❌ owner_id not set'); process.exit(1); }
if (!config.bots || config.bots.length === 0) { console.error('❌ No bots'); process.exit(1); }

function saveConfig() {
    try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    } catch (err) {
        logToConsole('warn', 'GLOBAL', `Failed to save config: ${err.message}`);
    }
}

// -----------------------
//  TRUSTED USERS
// -----------------------
const TRUSTED_USERS_FILE = path.join(__dirname, 'trusted_users.json');

function loadTrustedUsers() {
    try {
        if (fs.existsSync(TRUSTED_USERS_FILE)) return JSON.parse(fs.readFileSync(TRUSTED_USERS_FILE, 'utf-8'));
    } catch (err) { logToConsole('warn', 'GLOBAL', `Failed to load trusted users: ${err.message}`); }
    return [];
}
function saveTrustedUsers(users) { fs.writeFileSync(TRUSTED_USERS_FILE, JSON.stringify(users, null, 2)); }

let trustedUsers = loadTrustedUsers();
function isAuthorized(userId) { return userId === OWNER_ID || trustedUsers.includes(userId); }
function isOwner(userId) { return userId === OWNER_ID; }

// ══════════════════════════════════════════════
//  PLATFORM PRESETS
// ══════════════════════════════════════════════
const PLATFORMS = {
    desktop: { os: 'Windows', browser: 'Discord Client', device: '' },
    mobile:  { os: 'iOS', browser: 'Discord iOS', device: 'iPhone' },
    browser: { os: 'Windows', browser: 'Chrome', device: '' },
    vr:      { os: 'Quest', browser: 'Discord Embedded', device: 'Quest 3' },
};
const PLATFORM_LABELS = { desktop: '🖥️ Desktop', mobile: '📱 Mobile', browser: '🌐 Browser', vr: '🥽 VR' };

// ══════════════════════════════════════════════
//  BOT INSTANCE FACTORY
// ══════════════════════════════════════════════
function createBot(botConfig, botIndex) {
    const { name: botName, token } = botConfig;
    const platformKey = (botConfig.platform || 'desktop').toLowerCase();
    const tag = botName;
    const startTime = Date.now();
    let currentPlatform = platformKey;
    let lastVc = null;
    let presenceStatus = botConfig.presence || 'online';
    let loginFailed = false;
    let loginErrorMsg = '';

    // Per-bot settings (persisted in config.json)
    if (!botConfig.settings) botConfig.settings = {};
    const SETTING_DEFAULTS = { notifyOnMove: true, notifyOnDisconnect: true };
    function getSetting(key) { return botConfig.settings[key] !== undefined ? botConfig.settings[key] : SETTING_DEFAULTS[key]; }
    function getAllSettings() { return { ...SETTING_DEFAULTS, ...botConfig.settings }; }

    if (!token || token === 'TOKEN_HERE') {
        logToConsole('info', tag, 'Skipped — no token set.');
        return null;
    }

    const wsProps = PLATFORMS[platformKey] || PLATFORMS.desktop;
    const client = new Client({ syncStatus: true, ws: { properties: { ...wsProps } } });
    let vcRequester = { userId: null, dmChannelId: null, guildId: null };

    // - Safety handlers -
    client.on('error', (err) => logToConsole('warn', tag, `Client error: ${err.message}`));
    client.on('warn', (info) => logToConsole('warn', tag, `Warning: ${info}`));
    client.on('shardError', (err, sid) => logToConsole('warn', tag, `Shard ${sid ?? 0} error: ${err.message}`));
    client.on('shardDisconnect', (ev, sid) => logToConsole('warn', tag, `Shard ${sid ?? 0} disconnected (${ev?.code || '?'})`));
    client.on('shardReconnecting', (sid) => logToConsole('info', tag, `Shard ${sid ?? 0} reconnecting...`));
    client.on('shardResume', (sid, r) => logToConsole('info', tag, `Shard ${sid ?? 0} resumed (${r} events)`));
    client.on('invalidated', () => {
        loginFailed = true;
        loginErrorMsg = 'Session invalidated / Token banned';
        logToConsole('error', tag, 'Session invalidated! Token may be banned.');
        if (io) io.to('authed').emit('botStatuses', getStatusesData());
    });
    client.on('rateLimit', (info) => logToConsole('warn', tag, `Rate limited: ${info.path} (${info.timeout}ms)`));
    client.on('guildCreate', (g) => logToConsole('info', tag, `Joined server: ${g.name} (${g.id})`));
    client.on('guildDelete', (g) => logToConsole('info', tag, `Left server: ${g.name} (${g.id})`));

    // - Helpers -
    async function safeSend(channel, text, context = 'unknown') {
        try {
            const delay = Math.min(3000, Math.max(1000, text.length * 4));
            try { await channel.sendTyping(); } catch (_) {}
            await sleep(delay);
            return await channel.send(text);
        } catch (err) {
            logToConsole('warn', tag, `Send failed → to: ${channel.id}, from: ${context}: ${err.message}`);
            return null;
        }
    }

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    function sendVoiceStateUpdate(guildId, channelId, selfMute = false, selfDeaf = false) {
        const payload = { op: 4, d: { guild_id: guildId, channel_id: channelId, self_mute: selfMute, self_deaf: selfDeaf } };
        if (client.ws.shards && client.ws.shards.size > 0) {
            for (const [, shard] of client.ws.shards) shard.send(payload);
        } else if (client.ws && typeof client.ws.send === 'function') client.ws.send(payload);
    }

    function findCurrentVoice() {
        for (const [, guild] of client.guilds.cache) {
            const me = guild.members.cache.get(client.user?.id);
            if (me?.voice?.channel) return me.voice;
        }
        return null;
    }

    function formatUptime() {
        const diff = Date.now() - startTime;
        const s = Math.floor(diff / 1000) % 60, m = Math.floor(diff / 60000) % 60;
        const h = Math.floor(diff / 3600000) % 24, d = Math.floor(diff / 86400000);
        const parts = [];
        if (d > 0) parts.push(`${d}d`);
        if (h > 0) parts.push(`${h}h`);
        if (m > 0) parts.push(`${m}m`);
        parts.push(`${s}s`);
        return parts.join(' ');
    }

    function who(user) { return `${user?.tag || 'unknown'}(${user?.id || '?'})`; }

    // - Ready -
    client.on('ready', async () => {
        logToConsole('info', tag, `✅ Logged in as ${client.user.tag} (${client.user.id}) — ${client.guilds.cache.size} servers — ${PLATFORM_LABELS[currentPlatform] || currentPlatform}`);
        
        loginFailed = false;
        loginErrorMsg = '';

        // Cache state immediately on ready
        let avatarUrl = null;
        try { avatarUrl = client.user?.displayAvatarURL({ dynamic: true, size: 128 }); } catch (_) {}
        botConfig.cachedAvatarUrl = avatarUrl;
        botConfig.cachedServers = client.guilds.cache.size;
        botConfig.cachedTag = client.user.tag;
        botConfig.cachedUsername = client.user.username;
        botConfig.cachedId = client.user.id;
        botConfig.cachedGuildIds = client.guilds.cache.map(g => g.id);
        botConfig.cachedCreatedAt = client.user.createdAt ? client.user.createdAt.toISOString() : null;
        saveConfig();

        // Respect previous status of discord if set manually, otherwise apply config status after a short delay
        let presenceCheckCount = 0;
        const presenceInterval = setInterval(async () => {
            if (!client.user) {
                clearInterval(presenceInterval);
                return;
            }
            const detectedStatus = client.settings?.status || client.user.presence?.status;
            presenceCheckCount++;
            if (detectedStatus && ['online', 'idle', 'dnd', 'invisible', 'offline'].includes(detectedStatus)) {
                clearInterval(presenceInterval);
                const mappedStatus = detectedStatus === 'offline' ? 'invisible' : detectedStatus;
                presenceStatus = mappedStatus;
                botConfig.presence = mappedStatus;
                saveConfig();
                if (io) io.to('authed').emit('botStatuses', getStatusesData());
                logToConsole('info', tag, `Detected status from Discord session: ${mappedStatus}`);
            } else if (presenceCheckCount >= 5) {
                clearInterval(presenceInterval);
                // Fall back to config status if still undefined after 5 seconds
                try {
                    if (presenceStatus === 'streaming') {
                        await client.user.setPresence({
                            status: 'online',
                            activities: [{
                                name: 'Live Stream',
                                type: 'STREAMING',
                                url: 'https://twitch.tv/discord'
                            }]
                        });
                    } else {
                        const statusVal = presenceStatus === 'invisible' ? 'invisible' : presenceStatus;
                        await client.user.setStatus(statusVal);
                        await client.user.setPresence({
                            status: statusVal,
                            activities: []
                        });
                    }
                    logToConsole('info', tag, `Applied configured status: ${presenceStatus}`);
                } catch (err) {
                    logToConsole('warn', tag, `Failed to apply initial presence status (${presenceStatus}): ${err.message}`);
                }
            }
        }, 1000);
    });

    client.on('presenceUpdate', (oldPresence, newPresence) => {
        if (newPresence && newPresence.userId === client.user?.id) {
            const detectedStatus = client.settings?.status || newPresence.status;
            if (detectedStatus && ['online', 'idle', 'dnd', 'offline'].includes(detectedStatus)) {
                const mappedStatus = detectedStatus === 'offline' ? 'invisible' : detectedStatus;
                if (presenceStatus !== mappedStatus) {
                    presenceStatus = mappedStatus;
                    botConfig.presence = mappedStatus;
                    saveConfig();
                    if (io) io.to('authed').emit('botStatuses', getStatusesData());
                }
            }
        }
    });

    // Gateway Syncing for real-time status updates made from other Discord client applications
    client.on('raw', (packet) => {
        if (packet.t === 'USER_SETTINGS_UPDATE') {
            const status = packet.d?.status;
            if (status && ['online', 'idle', 'dnd', 'invisible', 'offline'].includes(status)) {
                const mappedStatus = status === 'offline' ? 'invisible' : status;
                if (presenceStatus !== mappedStatus) {
                    presenceStatus = mappedStatus;
                    botConfig.presence = mappedStatus;
                    saveConfig();
                    if (io) io.to('authed').emit('botStatuses', getStatusesData());
                    logToConsole('info', tag, `Status synced from external client: ${mappedStatus}`);
                }
            }
        }
    });

    //  Voice State Updates 
    client.on('voiceStateUpdate', async (oldState, newState) => {
        if (newState.id !== client.user.id) return;
        const oldCh = oldState.channelId, newCh = newState.channelId;
        if (oldCh === newCh) return;

        // Track last VC
        if (newCh) {
            const ch = client.channels.cache.get(newCh);
            const g = newState.guild;
            if (ch && g) lastVc = { serverId: g.id, serverName: g.name, channelId: ch.id, channelName: ch.name };
        }

        if (oldCh && newCh) {
            const oldChannel = client.channels.cache.get(oldCh);
            const newChannel = client.channels.cache.get(newCh);
            logToConsole('info', tag, `Moved: #${oldChannel?.name} → #${newChannel?.name} in ${newState.guild?.name}`);
            if (vcRequester.userId && getSetting('notifyOnMove')) {
                try {
                    const user = await client.users.fetch(vcRequester.userId);
                    const dm = await user.createDM();
                    await safeSend(dm, `🔄 **Channel Changed** - _${botName}_\n> **Server:** ${newState.guild?.name}\n> **From:** 🔊 ${oldChannel?.name}\n> **To:** 🔊 ${newChannel?.name}`, who(user));
                } catch (err) { logToConsole('warn', tag, `Move notify failed: ${err.message}`); }
            }
        }

        if (oldCh && !newCh) {
            const oldChannel = client.channels.cache.get(oldCh);
            logToConsole('info', tag, `Disconnected from #${oldChannel?.name}`);
            if (vcRequester.userId) {
                if (getSetting('notifyOnDisconnect')) {
                    try {
                        const user = await client.users.fetch(vcRequester.userId);
                        const dm = await user.createDM();
                        await safeSend(dm, `❌ **Disconnected** - _${botName}_\n> Removed from 🔊 **${oldChannel?.name}**.`, who(user));
                    } catch (err) { logToConsole('warn', tag, `Disconnect notify failed: ${err.message}`); }
                }
                vcRequester = { userId: null, dmChannelId: null, guildId: null };
            }
        }
    });

    //  DM Command Handler 
    client.on('messageCreate', async (message) => {
        if (message.channel.type !== 'DM') return;
        if (message.author.id === client.user.id) return;
        if (!isAuthorized(message.author.id)) return;
        const sender = who(message.author), senderId = message.author.id;
        const content = message.content.trim(), lower = content.toLowerCase();
        logToConsole('info', tag, `DM from ${sender}: ${content}`);

        if (lower === 'help')                    return handleHelp(message, senderId, sender);
        if (lower.startsWith('join vc'))         return handleJoinVc(message, content, sender);
        if (lower.startsWith('friend request '))  return handleFriendRequest(message, content, sender);
        if (lower === 'leave vc')                return handleLeaveVc(message, sender);
        if (lower.startsWith('leave '))          return handleLeaveServer(message, content, sender);
        if (lower === 'status')                  return handleStatus(message, sender);
        if (lower === 'mute')                    return handleMute(message, true, sender);
        if (lower === 'unmute')                  return handleMute(message, false, sender);
        if (lower === 'deafen')                  return handleDeafen(message, true, sender);
        if (lower === 'undeafen')                return handleDeafen(message, false, sender);
        if (lower === 'servers')                 return handleServers(message, sender);
        if (lower.startsWith('channels'))        return handleChannels(message, content, sender);
        if (lower === 'ping')                    return handlePing(message, sender);
        if (lower === 'uptime')                  return handleUptime(message, sender);
        if (lower.startsWith('set status'))      return handleSetStatus(message, content, sender);
        if (lower.startsWith('set platform'))    return handleSetPlatform(message, content, sender);
        if (isOwner(senderId)) {
            if (lower.startsWith('add user'))    return handleAddUser(message, content, sender);
            if (lower.startsWith('remove user')) return handleRemoveUser(message, content, sender);
            if (lower === 'list users')          return handleListUsers(message, sender);
        }
    });

    // ══ DM Handlers ══
    async function handleHelp(message, senderId, sender) {
        let h = `**${botName}** — Commands\n\n`;
        h += `**🔊 Voice**\n> \`Join vc <server_id> <channel_id>\`\n> \`Leave vc\` · \`Mute\` · \`Unmute\` · \`Deafen\` · \`Undeafen\`\n\n`;
        h += `**🏠 Servers**\n> \`Join <invite>\` — join server\n> \`Leave <server_id>\` — leave server\n\n`;
        h += `**📋 Info**\n> \`Status\` · \`Servers\` · \`Channels <id>\` · \`Ping\` · \`Uptime\`\n\n`;
        h += `**⚙️ Settings**\n> \`Set status <text>\` · \`Set platform <desktop|mobile|browser|vr>\``;
        if (isOwner(senderId)) h += `\n\n**🔐 Owner**\n> \`Add user <id>\` · \`Remove user <id>\` · \`List users\``;
        await safeSend(message.channel, h, sender);
    }

    async function handleJoinVc(message, content, sender) {
        const args = content.split(/\s+/);
        if (args.length < 4) return safeSend(message.channel, `❌ Usage: \`Join vc <server_id> <channel_id>\``, sender);
        const guild = client.guilds.cache.get(args[2]);
        if (!guild) return safeSend(message.channel, `❌ Server not found`, sender);
        const channel = guild.channels.cache.get(args[3]);
        if (!channel) return safeSend(message.channel, `❌ Channel not found`, sender);
        if (channel.type !== 'GUILD_VOICE' && channel.type !== 'GUILD_STAGE_VOICE') return safeSend(message.channel, `❌ Not a voice channel`, sender);
        try {
            sendVoiceStateUpdate(args[2], args[3], false, false);
            vcRequester = { userId: message.author.id, dmChannelId: message.channel.id, guildId: args[2] };
            await safeSend(message.channel, `✅ Joined 🔊 **${channel.name}** in **${guild.name}**`, sender);
        } catch (err) { await safeSend(message.channel, `❌ ${err.message}`, sender); }
    }

    async function handleFriendRequest(message, content, sender) {
        const args = content.split(/\s+/);
        if (args.length < 3) return safeSend(message.channel, `❌ Usage: \`friend request <user_id>\``, sender);
        const uid = args[2];
        try {
            await sendFriendRequestAPI(client, uid);
            await safeSend(message.channel, `✅ Friend request sent to **${uid}**`, sender);
        } catch (err) { await safeSend(message.channel, `❌ ${err.message}`, sender); }
    }

    async function handleLeaveVc(message, sender) {
        const voice = findCurrentVoice();
        if (!voice) return safeSend(message.channel, `⚠️ Not in voice`, sender);
        try {
            const n = voice.channel.name, g = voice.guild.name;
            sendVoiceStateUpdate(voice.guild.id, null, false, false);
            vcRequester = { userId: null, dmChannelId: null, guildId: null };
            await safeSend(message.channel, `✅ Left 🔊 **${n}** in **${g}**`, sender);
        } catch (err) { await safeSend(message.channel, `❌ ${err.message}`, sender); }
    }

    async function handleLeaveServer(message, content, sender) {
        const args = content.split(/\s+/);
        if (args.length < 2) return safeSend(message.channel, `❌ Usage: \`Leave <server_id>\``, sender);
        if (args[1].toLowerCase() === 'vc') return;
        const guild = client.guilds.cache.get(args[1]);
        if (!guild) return safeSend(message.channel, `❌ Server not found`, sender);
        const n = guild.name;
        try { await guild.leave(); await safeSend(message.channel, `✅ Left **${n}**`, sender); }
        catch (err) { await safeSend(message.channel, `❌ ${err.message}`, sender); }
    }

    async function handleStatus(message, sender) {
        const voice = findCurrentVoice();
        const plat = PLATFORM_LABELS[currentPlatform] || currentPlatform;
        let t = `📊 **${botName}**\n`;
        if (voice) { t += `> 🔊 **${voice.channel.name}** in ${voice.guild.name}\n> Mute: ${voice.selfMute ? '✅' : '❌'} · Deaf: ${voice.selfDeaf ? '✅' : '❌'}\n`; }
        else t += `> Voice: Not connected\n`;
        t += `> ${plat} · ${client.guilds.cache.size} servers · Up ${formatUptime()}`;
        await safeSend(message.channel, t, sender);
    }

    async function handleMute(message, mute, sender) {
        const voice = findCurrentVoice();
        if (!voice) return safeSend(message.channel, `⚠️ Not in voice`, sender);
        sendVoiceStateUpdate(voice.guild.id, voice.channelId, mute, voice.selfDeaf);
        await safeSend(message.channel, mute ? `🔇 Muted` : `🔊 Unmuted`, sender);
    }

    async function handleDeafen(message, deaf, sender) {
        const voice = findCurrentVoice();
        if (!voice) return safeSend(message.channel, `⚠️ Not in voice`, sender);
        sendVoiceStateUpdate(voice.guild.id, voice.channelId, voice.selfMute, deaf);
        await safeSend(message.channel, deaf ? `🔇 Deafened` : `🔊 Undeafened`, sender);
    }

    async function handleServers(message, sender) {
        const guilds = client.guilds.cache.sort((a, b) => a.name.localeCompare(b.name));
        if (guilds.size === 0) return safeSend(message.channel, `⚠️ No servers`, sender);
        let pages = [], cur = `**Servers (${guilds.size})**\n`, i = 0;
        guilds.forEach(g => { i++; const l = `> **${i}.** ${g.name} · \`${g.id}\`\n`; if ((cur + l).length > 1900) { pages.push(cur); cur = ''; } cur += l; });
        if (cur) pages.push(cur);
        for (const p of pages) await safeSend(message.channel, p, sender);
    }

    async function handleChannels(message, content, sender) {
        const args = content.split(/\s+/);
        if (args.length < 2) return safeSend(message.channel, `❌ Usage: \`Channels <server_id>\``, sender);
        const guild = client.guilds.cache.get(args[1]);
        if (!guild) return safeSend(message.channel, `❌ Server not found`, sender);
        const vcs = guild.channels.cache.filter(ch => ch.type === 'GUILD_VOICE' || ch.type === 'GUILD_STAGE_VOICE').sort((a, b) => a.rawPosition - b.rawPosition);
        if (vcs.size === 0) return safeSend(message.channel, `⚠️ No voice channels`, sender);
        let t = `**🔊 ${guild.name}** (${vcs.size})\n`, i = 0;
        vcs.forEach(ch => { i++; t += `> **${i}.** ${ch.name} · \`${ch.id}\`\n`; });
        await safeSend(message.channel, t, sender);
    }

    async function handlePing(message, sender) {
        try {
            try { await message.channel.sendTyping(); } catch (_) {}
            await sleep(1000);
            const sent = await message.channel.send('🏓 Pinging...');
            if (sent) { const lat = sent.createdTimestamp - message.createdTimestamp; await sleep(500); try { await sent.edit(`🏓 **${lat}ms** · WS ${client.ws.ping}ms`); } catch (_) {} }
        } catch (err) { logToConsole('warn', tag, `Ping failed: ${err.message}`); }
    }

    async function handleUptime(message, sender) { await safeSend(message.channel, `⏱️ Up **${formatUptime()}**`, sender); }

    async function handleSetStatus(message, content, sender) {
        const t = content.slice('set status'.length).trim();
        if (!t) return safeSend(message.channel, `❌ Usage: \`Set status <text>\``, sender);
        try { await client.user.setActivity(t, { type: 'PLAYING' }); await safeSend(message.channel, `✅ Playing **${t}**`, sender); }
        catch (err) { await safeSend(message.channel, `❌ ${err.message}`, sender); }
    }

    async function handleSetPlatform(message, content, sender) {
        const p = (content.split(/\s+/)[2] || '').toLowerCase();
        if (!p || !PLATFORMS[p]) return safeSend(message.channel, `❌ Usage: \`Set platform <desktop|mobile|browser|vr>\``, sender);
        currentPlatform = p;
        await safeSend(message.channel, `🔄 Reconnecting as ${PLATFORM_LABELS[p]}...`, sender);
        try { client.destroy(); client.options.ws.properties = { ...PLATFORMS[p] }; await client.login(token); } catch (err) { logToConsole('warn', tag, `Platform switch failed: ${err.message}`); }
    }

    async function handleAddUser(message, content, sender) {
        const uid = content.split(/\s+/)[2];
        if (!uid) return safeSend(message.channel, `❌ Usage: \`Add user <id>\``, sender);
        if (uid === OWNER_ID || trustedUsers.includes(uid)) return safeSend(message.channel, `ℹ️ Already trusted`, sender);
        let n = uid; try { n = (await client.users.fetch(uid)).tag; } catch (_) {}
        trustedUsers.push(uid); saveTrustedUsers(trustedUsers);
        logToConsole('info', tag, `User added by ${sender}: ${n}(${uid})`);
        await safeSend(message.channel, `✅ Added **${n}**`, sender);
    }

    async function handleRemoveUser(message, content, sender) {
        const uid = content.split(/\s+/)[2];
        if (!uid || !trustedUsers.includes(uid)) return safeSend(message.channel, `⚠️ Not found`, sender);
        let n = uid; try { n = (await client.users.fetch(uid)).tag; } catch (_) {}
        trustedUsers = trustedUsers.filter(id => id !== uid); saveTrustedUsers(trustedUsers);
        logToConsole('info', tag, `User removed by ${sender}: ${n}(${uid})`);
        await safeSend(message.channel, `✅ Removed **${n}**`, sender);
    }

    async function handleListUsers(message, sender) {
        if (trustedUsers.length === 0) return safeSend(message.channel, `No trusted users`, sender);
        let t = `**Trusted Users (${trustedUsers.length})**\n`;
        for (let i = 0; i < trustedUsers.length; i++) { let n = trustedUsers[i]; try { n = (await client.users.fetch(trustedUsers[i])).tag; } catch (_) {} t += `> **${i + 1}.** ${n} · \`${trustedUsers[i]}\`\n`; }
        await safeSend(message.channel, t, sender);
    }

    // ══ Web Command Processor ══
    async function processWebCommand(command) {
        const lower = command.toLowerCase().trim(), args = command.trim().split(/\s+/);
        try {
            if (lower.startsWith('join vc')) {
                if (args.length < 4) return '❌ Usage: Join vc <server_id> <channel_id>';
                const guild = client.guilds.cache.get(args[2]);
                if (!guild) return `❌ Server not found`;
                const ch = guild.channels.cache.get(args[3]);
                if (!ch) return `❌ Channel not found`;
                if (ch.type !== 'GUILD_VOICE' && ch.type !== 'GUILD_STAGE_VOICE') return '❌ Not a voice channel';
                sendVoiceStateUpdate(args[2], args[3], false, false);
                vcRequester = { userId: OWNER_ID, dmChannelId: null, guildId: args[2] };
                return `✅ Joined 🔊 ${ch.name} in ${guild.name}`;
            }

            if (lower === 'leave vc') {
                const v = findCurrentVoice(); if (!v) return '⚠️ Not in voice';
                sendVoiceStateUpdate(v.guild.id, null, false, false);
                vcRequester = { userId: null, dmChannelId: null, guildId: null };
                return `✅ Left 🔊 ${v.channel.name}`;
            }
            if (lower.startsWith('leave ')) {
                if (args[1].toLowerCase() === 'vc') return;
                const guild = client.guilds.cache.get(args[1]);
                if (!guild) return `❌ Server not found`;
                const n = guild.name; await guild.leave(); return `✅ Left ${n}`;
            }
            if (lower === 'mute' || lower === 'unmute') {
                const v = findCurrentVoice(); if (!v) return '⚠️ Not in voice';
                const mute = lower === 'mute';
                // If unmuting, we must also undeafen (cannot be unmuted and deafened)
                const deaf = mute ? v.selfDeaf : false;
                sendVoiceStateUpdate(v.guild.id, v.channelId, mute, deaf);
                return mute ? '🔇 Muted' : '🔊 Unmuted';
            }
            if (lower === 'deafen' || lower === 'undeafen') {
                const v = findCurrentVoice(); if (!v) return '⚠️ Not in voice';
                const deaf = lower === 'deafen';
                // If deafening, we must also mute. If undeafening, we also unmute
                const mute = deaf ? true : false;
                sendVoiceStateUpdate(v.guild.id, v.channelId, mute, deaf);
                return deaf ? '🔇 Deafened' : '🔊 Undeafened';
            }
            if (lower === 'status') {
                const v = findCurrentVoice(); const plat = PLATFORM_LABELS[currentPlatform] || currentPlatform;
                let t = `📊 ${botName}\n`;
                if (v) t += `🔊 ${v.channel.name} in ${v.guild.name} | Mute: ${v.selfMute ? '✅' : '❌'} Deaf: ${v.selfDeaf ? '✅' : '❌'}\n`;
                else t += 'Voice: Not connected\n';
                t += `${plat} · ${client.guilds.cache.size} servers · Up ${formatUptime()}`;
                return t;
            }
            if (lower === 'servers') {
                const g = client.guilds.cache.sort((a, b) => a.name.localeCompare(b.name));
                if (g.size === 0) return 'No servers'; let t = '', i = 0;
                g.forEach(gg => { i++; t += `${i}. ${gg.name} — ${gg.id}\n`; }); return t;
            }
            if (lower.startsWith('channels')) {
                if (args.length < 2) return '❌ Usage: Channels <server_id>';
                const guild = client.guilds.cache.get(args[1]);
                if (!guild) return `❌ Server not found`;
                const vcs = guild.channels.cache.filter(ch => ch.type === 'GUILD_VOICE' || ch.type === 'GUILD_STAGE_VOICE').sort((a, b) => a.rawPosition - b.rawPosition);
                if (vcs.size === 0) return 'No voice channels'; let t = '', i = 0;
                vcs.forEach(ch => { i++; t += `${i}. ${ch.name} — ${ch.id}\n`; }); return t;
            }
            if (lower === 'ping') return `🏓 WS: ${client.ws.ping}ms`;
            if (lower === 'uptime') return `⏱️ Up ${formatUptime()}`;
            if (lower.startsWith('set status')) {
                const st = command.slice('set status'.length).trim();
                if (!st) return '❌ Usage: Set status <text>';
                try {
                    if (client.user && typeof client.user.setCustomStatus === 'function') {
                        await client.user.setCustomStatus({ text: st });
                    } else if (client.user) {
                        await client.user.setPresence({
                            activities: [{
                                name: "Custom Status",
                                type: "CUSTOM",
                                state: st
                            }]
                        });
                    }
                } catch (err) {
                    if (client.user) await client.user.setActivity(st, { type: 'PLAYING' });
                }
                return `✅ Status set to "${st}"`;
            }
            if (lower.startsWith('friend request ')) {
                const uid = args[2] || '';
                if (!uid) return '❌ Usage: friend request <user_id>';
                try {
                    await sendFriendRequestAPI(client, uid);
                    return `✅ Friend request sent to ${uid}`;
                } catch (err) {
                    return `❌ ${err.message}`;
                }
            }
            if (lower.startsWith('set presence ')) {
                const pr = args[2] || '';
                if (!['online', 'idle', 'dnd', 'streaming', 'invisible'].includes(pr.toLowerCase())) {
                    return '❌ Usage: Set presence <online|idle|dnd|streaming|invisible>';
                }
                const presenceLower = pr.toLowerCase();
                presenceStatus = presenceLower;
                botConfig.presence = presenceLower;
                saveConfig();
                try {
                    if (client.user) {
                        if (presenceLower === 'streaming') {
                            await client.user.setPresence({
                                status: 'online',
                                activities: [{
                                    name: 'Live Stream',
                                    type: 'STREAMING',
                                    url: 'https://twitch.tv/discord'
                                }]
                            });
                        } else {
                            const statusVal = presenceLower === 'invisible' ? 'invisible' : presenceLower;
                            await client.user.setStatus(statusVal);
                            await client.user.setPresence({
                                status: statusVal,
                                activities: []
                            });
                        }
                    }
                } catch (err) {
                    return `❌ Failed to set presence: ${err.message}`;
                }
                return `✅ Presence set to ${presenceLower}`;
            }
            if (lower.startsWith('set platform')) {
                const p = (args[2] || '').toLowerCase();
                if (!p || !PLATFORMS[p]) return '❌ Usage: Set platform <desktop|mobile|browser|vr>';
                currentPlatform = p; client.destroy();
                client.options.ws.properties = { ...PLATFORMS[p] }; await client.login(token);
                return `🔄 Reconnecting as ${PLATFORM_LABELS[p]}...`;
            }
            if (lower === 'help') return 'Use the panel buttons or type commands in the command input.';
            return `❓ Unknown: ${command}`;
        } catch (err) {
            logToConsole('warn', tag, `Web command failed: "${command}" — ${err.message}`);
            return `❌ ${err.message}`;
        }
    }

    // ══ Web API Methods ══
    function getStatus() {
        const voice = findCurrentVoice();
        let avatarUrl = null;
        try { avatarUrl = client.user?.displayAvatarURL({ dynamic: true, size: 128 }); } catch (_) {}

        if (client.user) {
            let changed = false;
            if (botConfig.cachedAvatarUrl !== avatarUrl) { botConfig.cachedAvatarUrl = avatarUrl; changed = true; }
            if (botConfig.cachedServers !== client.guilds.cache.size) { botConfig.cachedServers = client.guilds.cache.size; changed = true; }
            if (botConfig.cachedTag !== client.user.tag) { botConfig.cachedTag = client.user.tag; changed = true; }
            if (botConfig.cachedUsername !== client.user.username) { botConfig.cachedUsername = client.user.username; changed = true; }
            if (botConfig.cachedId !== client.user.id) { botConfig.cachedId = client.user.id; changed = true; }

            const liveGuildIds = client.guilds.cache.map(g => g.id);
            if (!Array.isArray(botConfig.cachedGuildIds) || botConfig.cachedGuildIds.length !== liveGuildIds.length || !liveGuildIds.every((id, idx) => botConfig.cachedGuildIds[idx] === id)) {
                botConfig.cachedGuildIds = liveGuildIds;
                changed = true;
            }

            const liveCreatedAt = client.user.createdAt ? client.user.createdAt.toISOString() : null;
            if (botConfig.cachedCreatedAt !== liveCreatedAt) {
                botConfig.cachedCreatedAt = liveCreatedAt;
                changed = true;
            }

            if (changed) {
                saveConfig();
            }
        }

        return {
            configId: botConfig.configId,
            name: botName,
            tag: client.user?.tag || botConfig.cachedTag || 'Connecting...',
            username: client.user?.username || botConfig.cachedUsername || '',
            id: client.user?.id || botConfig.cachedId || '?',
            servers: client.user ? client.guilds.cache.size : (botConfig.cachedServers || 0),
            guildIds: client.user ? client.guilds.cache.map(g => g.id) : (botConfig.cachedGuildIds || []),
            platform: PLATFORM_LABELS[currentPlatform] || currentPlatform,
            platformKey: currentPlatform,
            uptime: formatUptime(),
            avatarUrl: avatarUrl || botConfig.cachedAvatarUrl || null,
            note: botConfig.note || '',
            lastVc,
            settings: getAllSettings(),
            createdAt: client.user?.createdAt ? client.user.createdAt.toISOString() : (botConfig.cachedCreatedAt || null),
            presenceStatus,
            voice: voice ? {
                channel: voice.channel.name,
                channelId: voice.channelId,
                guild: voice.guild.name,
                guildId: voice.guild.id,
                muted: voice.selfMute,
                deafened: voice.selfDeaf,
            } : null,
            ready: !!client.user,
            loginFailed,
            loginErrorMsg,
            disabled: !!botConfig.disabled,
        };
    }

    function getServers() {
        return client.guilds.cache
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(g => ({
                id: g.id,
                name: g.name,
                iconUrl: g.iconURL({ size: 64 }) || null,
                memberCount: g.memberCount,
            }));
    }

    function getVoiceChannels(serverId) {
        const guild = client.guilds.cache.get(serverId);
        if (!guild) return [];
        return guild.channels.cache
            .filter(ch => ch.type === 'GUILD_VOICE' || ch.type === 'GUILD_STAGE_VOICE')
            .sort((a, b) => a.rawPosition - b.rawPosition)
            .map(ch => ({
                id: ch.id,
                name: ch.name,
                type: ch.type,
                userCount: ch.members?.size || 0,
            }));
    }

    client.login(token).catch(err => {
        loginFailed = true;
        loginErrorMsg = err.message;
        logToConsole('error', tag, `Login failed: ${err.message}`);
        if (io) io.to('authed').emit('botStatuses', getStatusesData());
    });

    return { client, name: botName, getStatus, processWebCommand, getServers, getVoiceChannels };
}

// ══════════════════════════════════════════════
//  LAUNCH ALL BOTS
// ══════════════════════════════════════════════
console.log('╔═══════════════════════════════════════════════╗');
console.log('║     Discord Client Bot — Multi-Bot Launcher   ║');
console.log(`║     Owner: ${OWNER_ID}            ║`);
console.log(`║     Bots: ${config.bots.length}  ·  Trusted: ${trustedUsers.length}  ·  Web: :${WEB_PORT}        ║`);
console.log('╚═══════════════════════════════════════════════╝\n');

const activeBots = [];
for (let i = 0; i < config.bots.length; i++) {
    const botCfg = config.bots[i];
    if (botCfg.disabled === true) {
        logToConsole('info', botCfg.name, 'Skipped startup login — bot is disabled.');
        activeBots.push(null);
    } else {
        const instance = createBot(botCfg, i);
        if (instance) activeBots.push(instance);
        else activeBots.push(null);
    }
}
if (config.bots.length === 0) { console.error('❌ No bots configured in config.json.'); process.exit(1); }
logToConsole('info', 'LAUNCHER', `${activeBots.filter(b => b).length} bot(s) launching...`);

// ══════════════════════════════════════════════
//  WEB SERVER
// ══════════════════════════════════════════════
const app = express();
const server = http.createServer(app);
io = new SocketIO(server);
app.use(express.static(path.join(__dirname, 'public')));

function getStatusesData() {
    return config.bots.map((botCfg, i) => {
        const b = activeBots[i];
        if (!b) {
            return {
                index: i,
                configId: botCfg.configId,
                name: botCfg.name,
                tag: botCfg.cachedTag || 'Offline',
                username: botCfg.cachedUsername || '',
                id: botCfg.cachedId || '?',
                servers: botCfg.cachedServers || 0,
                guildIds: botCfg.cachedGuildIds || [],
                platform: PLATFORM_LABELS[botCfg.platform] || botCfg.platform,
                platformKey: botCfg.platform,
                uptime: 'Offline',
                avatarUrl: botCfg.cachedAvatarUrl || null,
                note: botCfg.note || '',
                lastVc: null,
                settings: botCfg.settings || {},
                createdAt: botCfg.cachedCreatedAt || null,
                voice: null,
                ready: false,
                unloaded: true,
                presenceStatus: 'offline',
                disabled: !!botCfg.disabled
            };
        }
        return { index: i, configId: botCfg.configId, ...b.getStatus(), unloaded: false };
    });
}

io.on('connection', (socket) => {
    logToConsole('info', 'WEB', `Client connected: ${socket.id}`);

    socket.on('auth', ({ password }) => {
        if (password === WEB_PASSWORD) {
            socket.join('authed');
            socket.emit('authResult', { success: true });
            socket.emit('botStatuses', getStatusesData());
            socket.emit('consoleLogs', consoleLogs.slice(-200));
            emitTrustedUsers(socket);
            logToConsole('info', 'WEB', `Authenticated: ${socket.id}`);
        } else {
            socket.emit('authResult', { success: false });
            logToConsole('warn', 'WEB', `Auth failed: ${socket.id}`);
        }
    });

    socket.on('requestStatuses', () => {
        if (!socket.rooms.has('authed')) return;
        socket.emit('botStatuses', getStatusesData());
    });

    socket.on('executeCommand', async ({ botIndex, command }) => {
        if (!socket.rooms.has('authed')) return;
        if (botIndex < 0 || botIndex >= activeBots.length) return socket.emit('commandResult', { bot: '?', command, result: '❌ Invalid bot', success: false });
        const bot = activeBots[botIndex];
        if (!bot) return socket.emit('commandResult', { bot: 'System', command, result: '❌ Bot is unloaded/offline', success: false });
        logToConsole('info', 'WEB', `Command → [${bot.name}]: ${command}`);
        const result = await bot.processWebCommand(command);
        socket.emit('commandResult', { bot: bot.name, command, result: result || '✅ Done', success: !result?.startsWith('❌') });
    });

    socket.on('getBotServers', ({ botIndex }) => {
        if (!socket.rooms.has('authed')) return;
        if (botIndex < 0 || botIndex >= activeBots.length) return;
        const bot = activeBots[botIndex];
        if (!bot) return;
        socket.emit('botServers', { botIndex, servers: bot.getServers() });
    });

    socket.on('getBotChannels', ({ botIndex, serverId }) => {
        if (!socket.rooms.has('authed')) return;
        if (botIndex < 0 || botIndex >= activeBots.length) return;
        const bot = activeBots[botIndex];
        if (!bot) return;
        const guild = bot.client.guilds.cache.get(serverId);
        socket.emit('botChannels', { botIndex, serverId, serverName: guild?.name || '?', channels: bot.getVoiceChannels(serverId) });
    });

    socket.on('addBot', ({ name, token, platform, disabled }) => {
        if (!socket.rooms.has('authed')) return;
        if (!name || !token) return socket.emit('commandResult', { bot: 'System', command: 'Add bot', result: '❌ Name and token required', success: false });
        const botConfig = {
            configId: 'cfg_' + Math.random().toString(36).substring(2, 11),
            name,
            token,
            platform: platform || 'desktop',
            note: '',
            disabled: !!disabled
        };
        config.bots.push(botConfig);
        saveConfig();
        if (botConfig.disabled) {
            activeBots.push(null);
            logToConsole('info', 'WEB', `Bot added (disabled): ${name}`);
            socket.emit('commandResult', { bot: 'System', command: 'Add bot', result: `✅ Added ${name} (disabled)`, success: true });
        } else {
            const instance = createBot(botConfig, config.bots.length - 1);
            if (instance) {
                activeBots.push(instance);
                logToConsole('info', 'WEB', `Bot added: ${name}`);
                socket.emit('commandResult', { bot: 'System', command: 'Add bot', result: `✅ Added ${name}`, success: true });
            } else {
                activeBots.push(null);
                socket.emit('commandResult', { bot: 'System', command: 'Add bot', result: '❌ Failed to start (added offline)', success: false });
            }
        }
        io.to('authed').emit('botStatuses', getStatusesData());
    });

    socket.on('reloadBot', ({ botIndex }) => {
        if (!socket.rooms.has('authed')) return;
        if (botIndex < 0 || botIndex >= activeBots.length) return;
        const name = config.bots[botIndex].name;
        logToConsole('info', 'WEB', `Reloading/starting bot: ${name} (#${botIndex})...`);
        if (activeBots[botIndex]) {
            try {
                activeBots[botIndex].client.destroy();
            } catch (_) {}
        }
        const newInstance = createBot(config.bots[botIndex], botIndex);
        if (newInstance) {
            activeBots[botIndex] = newInstance;
            logToConsole('info', 'WEB', `✅ Bot loaded/reloaded: ${name}`);
            socket.emit('commandResult', { bot: 'System', command: 'Reload', result: `✅ Loaded/Reloaded ${name}`, success: true });
        } else {
            activeBots[botIndex] = null;
            socket.emit('commandResult', { bot: 'System', command: 'Reload', result: `❌ Failed to load ${name}`, success: false });
        }
        io.to('authed').emit('botStatuses', getStatusesData());
    });

    socket.on('unloadBot', ({ botIndex }) => {
        if (!socket.rooms.has('authed')) return;
        if (botIndex < 0 || botIndex >= activeBots.length) return;
        const bot = activeBots[botIndex];
        if (!bot) return socket.emit('commandResult', { bot: 'System', command: 'Unload', result: 'ℹ️ Already unloaded', success: true });
        const name = bot.name;
        logToConsole('info', 'WEB', `Unloading bot: ${name} (#${botIndex})...`);
        const botCfg = config.bots[botIndex];
        if (bot.client && bot.client.user) {
            let avatarUrl = null;
            try { avatarUrl = bot.client.user.displayAvatarURL({ dynamic: true, size: 128 }); } catch (_) {}
            botCfg.cachedAvatarUrl = avatarUrl || botCfg.cachedAvatarUrl;
            botCfg.cachedServers = bot.client.guilds.cache.size || botCfg.cachedServers;
            botCfg.cachedTag = bot.client.user.tag || botCfg.cachedTag;
            botCfg.cachedUsername = bot.client.user.username || botCfg.cachedUsername;
            botCfg.cachedId = bot.client.user.id || botCfg.cachedId;
            botCfg.cachedGuildIds = bot.client.guilds.cache.map(g => g.id) || botCfg.cachedGuildIds;
            botCfg.cachedCreatedAt = bot.client.user.createdAt ? bot.client.user.createdAt.toISOString() : botCfg.cachedCreatedAt;
            saveConfig();
        }
        try {
            bot.client.destroy();
        } catch (_) {}
        activeBots[botIndex] = null;
        logToConsole('info', 'WEB', `✅ Bot unloaded: ${name}`);
        socket.emit('commandResult', { bot: 'System', command: 'Unload', result: `✅ Unloaded ${name}`, success: true });
        io.to('authed').emit('botStatuses', getStatusesData());
    });

    socket.on('removeBot', ({ botIndex }) => {
        if (!socket.rooms.has('authed')) return;
        if (botIndex < 0 || botIndex >= config.bots.length) return;
        const bot = activeBots[botIndex];
        const name = config.bots[botIndex].name;
        logToConsole('info', 'WEB', `Removing bot: ${name} (#${botIndex})...`);
        if (bot) {
            try {
                bot.client.destroy();
            } catch (_) {}
        }
        config.bots.splice(botIndex, 1);
        activeBots.splice(botIndex, 1);
        saveConfig();
        logToConsole('info', 'WEB', `✅ Bot removed from config: ${name}`);
        socket.emit('commandResult', { bot: 'System', command: 'Remove bot', result: `✅ Removed ${name} from config`, success: true });
        io.to('authed').emit('botStatuses', getStatusesData());
    });

    socket.on('massUnload', ({ botIndices }) => {
        if (!socket.rooms.has('authed')) return;
        if (!Array.isArray(botIndices) || botIndices.length === 0) return;
        botIndices.forEach(idx => {
            if (idx >= 0 && idx < activeBots.length) {
                const bot = activeBots[idx];
                if (bot) {
                    const botCfg = config.bots[idx];
                    if (bot.client && bot.client.user) {
                        let avatarUrl = null;
                        try { avatarUrl = bot.client.user.displayAvatarURL({ dynamic: true, size: 128 }); } catch (_) {}
                        botCfg.cachedAvatarUrl = avatarUrl || botCfg.cachedAvatarUrl;
                        botCfg.cachedServers = bot.client.guilds.cache.size || botCfg.cachedServers;
                        botCfg.cachedTag = bot.client.user.tag || botCfg.cachedTag;
                        botCfg.cachedUsername = bot.client.user.username || botCfg.cachedUsername;
                        botCfg.cachedId = bot.client.user.id || botCfg.cachedId;
                        botCfg.cachedGuildIds = bot.client.guilds.cache.map(g => g.id) || botCfg.cachedGuildIds;
                        botCfg.cachedCreatedAt = bot.client.user.createdAt ? bot.client.user.createdAt.toISOString() : botCfg.cachedCreatedAt;
                    }
                    try { bot.client.destroy(); } catch (_) {}
                    activeBots[idx] = null;
                    logToConsole('info', 'WEB', `✅ Bot unloaded: ${bot.name}`);
                }
            }
        });
        saveConfig();
        socket.emit('commandResult', { bot: 'System', command: 'Mass Unload', result: `✅ Unloaded selected bots`, success: true });
        io.to('authed').emit('botStatuses', getStatusesData());
    });

    socket.on('editBot', ({ botIndex, name, token, platform, reload, disabled }) => {
        if (!socket.rooms.has('authed')) return;
        if (botIndex < 0 || botIndex >= config.bots.length) return;
        const botCfg = config.bots[botIndex];
        const oldName = botCfg.name;
        const wasDisabled = !!botCfg.disabled;
        
        if (name) botCfg.name = name;
        if (token) botCfg.token = token;
        if (platform && PLATFORMS[platform]) botCfg.platform = platform;
        if (disabled !== undefined) botCfg.disabled = !!disabled;
        
        saveConfig();
        logToConsole('info', 'WEB', `Bot edited: ${oldName} → name=${botCfg.name}, platform=${botCfg.platform}, disabled=${botCfg.disabled}${token ? ', token=changed' : ''}`);

        const nowDisabled = !!botCfg.disabled;

        if (nowDisabled) {
            if (botIndex < activeBots.length && activeBots[botIndex]) {
                try { activeBots[botIndex].client.destroy(); } catch (_) {}
                activeBots[botIndex] = null;
                logToConsole('info', 'WEB', `✅ Bot deactivated/destroyed on disable: ${botCfg.name}`);
            }
            socket.emit('commandResult', { bot: 'System', command: 'Edit bot', result: `✅ Updated ${botCfg.name} (Disabled)`, success: true });
        } else {
            const shouldLoad = wasDisabled || reload || token || !activeBots[botIndex];
            if (shouldLoad) {
                if (botIndex < activeBots.length && activeBots[botIndex]) {
                    try { activeBots[botIndex].client.destroy(); } catch (_) {}
                }
                const newInstance = createBot(botCfg, botIndex);
                if (newInstance) {
                    activeBots[botIndex] = newInstance;
                    logToConsole('info', 'WEB', `✅ Bot loaded/reloaded after edit: ${botCfg.name}`);
                    socket.emit('commandResult', { bot: 'System', command: 'Edit bot', result: `✅ Updated & loaded ${botCfg.name}`, success: true });
                } else {
                    activeBots[botIndex] = null;
                    socket.emit('commandResult', { bot: 'System', command: 'Edit bot', result: `⚠️ Updated config but failed to start`, success: false });
                }
            } else {
                socket.emit('commandResult', { bot: 'System', command: 'Edit bot', result: `✅ Updated ${botCfg.name} (no reload)`, success: true });
            }
        }
        io.to('authed').emit('botStatuses', getStatusesData());
    });

    socket.on('massCommand', async ({ botIndices, command }) => {
        if (!socket.rooms.has('authed')) return;
        if (!command || !Array.isArray(botIndices) || botIndices.length === 0) {
            return socket.emit('commandResult', { bot: 'System', command, result: '❌ Select bots and enter a command', success: false });
        }

        logToConsole('info', 'WEB', `Mass command → [${botIndices.join(',')}]: ${command}`);
        const results = [];
        const isFriendReq = command.toLowerCase().trim().startsWith('friend request');

        if (isFriendReq) {
            // Sequential execution: one bot at a time with staggered delay
            for (let i = 0; i < botIndices.length; i++) {
                const idx = botIndices[i];
                if (idx < 0 || idx >= activeBots.length || !activeBots[idx]) {
                    results.push({ bot: `Bot #${idx}`, result: '❌ Offline/Unloaded', success: false });
                    socket.emit('commandResult', { bot: `Bot #${idx}`, command, result: '❌ Offline/Unloaded', success: false });
                    continue;
                }
                const bot = activeBots[idx];
                try {
                    // Delay between bots (skip first)
                    if (i > 0) {
                        const delayMs = 1000 + Math.random() * 4000;
                        logToConsole('info', bot.name, `Waiting ${(delayMs / 1000).toFixed(2)}s before sending friend request...`);
                        await new Promise(r => setTimeout(r, delayMs));
                    }
                    const result = await bot.processWebCommand(command);
                    const success = !result?.startsWith('❌');
                    results.push({ bot: bot.name, result: result || '✅ Done', success });
                    socket.emit('commandResult', { bot: bot.name, command, result: result || '✅ Done', success });
                } catch (err) {
                    results.push({ bot: bot.name, result: `❌ ${err.message}`, success: false });
                    socket.emit('commandResult', { bot: bot.name, command, result: `❌ ${err.message}`, success: false });
                }
            }

            const allSuccess = results.every(r => r.success);
            const summary = results.map(r => `[${r.bot}] ${r.result}`).join('\n');
            socket.emit('commandResult', {
                bot: `${results.length} bots`,
                command,
                result: summary,
                success: allSuccess,
            });
        } else {
            // Non-friend-request commands run concurrently
            const promises = botIndices.map(async (idx) => {
                if (idx < 0 || idx >= activeBots.length || !activeBots[idx]) {
                    results.push({ bot: `Bot #${idx}`, result: '❌ Offline/Unloaded', success: false });
                    return;
                }
                const bot = activeBots[idx];
                try {
                    const result = await bot.processWebCommand(command);
                    results.push({ bot: bot.name, result: result || '✅ Done', success: !result?.startsWith('❌') });
                } catch (err) {
                    results.push({ bot: bot.name, result: `❌ ${err.message}`, success: false });
                }
            });

            await Promise.all(promises);

            const summary = results.map(r => `[${r.bot}] ${r.result}`).join('\n');
            const allSuccess = results.every(r => r.success);
            socket.emit('commandResult', {
                bot: `${results.length} bots`,
                command,
                result: summary,
                success: allSuccess,
            });
        }
    });

    socket.on('massDm', async ({ botIndices, userId, message, deleteAfter, delay }) => {
        if (!socket.rooms.has('authed')) return;
        if (!Array.isArray(botIndices) || botIndices.length === 0) {
            return socket.emit('commandResult', { bot: 'System', command: 'Mass DM', result: '❌ Select bots first', success: false });
        }
        if (!userId || !message) {
            return socket.emit('commandResult', { bot: 'System', command: 'Mass DM', result: '❌ Target User ID and Message content required', success: false });
        }

        let delayMin = 2;
        let delayMax = 5;

        if (typeof delay === 'string') {
            const parts = delay.split(/[-–—,]|to/i).map(p => parseFloat(p.trim()));
            if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                delayMin = Math.min(parts[0], parts[1]);
                delayMax = Math.max(parts[0], parts[1]);
            } else if (parts.length === 1 && !isNaN(parts[0])) {
                delayMin = parts[0];
                delayMax = parts[0];
            }
        } else if (typeof delay === 'number' && !isNaN(delay)) {
            delayMin = delay;
            delayMax = delay;
        }

        logToConsole('info', 'WEB', `Mass DM → [${botIndices.join(',')}]: to User ${userId}, msg="${message}", delete=${deleteAfter}, delayRange=${delayMin}-${delayMax}s`);
        const results = [];
        let accumulatedDelay = 0;

        const promises = botIndices.map(async (idx, i) => {
            if (idx < 0 || idx >= activeBots.length || !activeBots[idx]) {
                results.push({ bot: `Bot #${idx}`, result: '❌ Offline/Unloaded', success: false });
                return;
            }
            const bot = activeBots[idx];
            
            // Calculate delay for this bot
            let currentDelayMs = 0;
            if (i > 0) {
                const rand = delayMin + Math.random() * (delayMax - delayMin);
                accumulatedDelay += rand;
                currentDelayMs = accumulatedDelay * 1000;
            }

            try {
                if (currentDelayMs > 0) {
                    await new Promise(r => setTimeout(r, currentDelayMs));
                }
                const user = await bot.client.users.fetch(userId);
                const dm = await user.createDM();
                const sent = await dm.send(message);
                if (deleteAfter) {
                    await new Promise(r => setTimeout(r, 1000));
                    await sent.delete();
                    results.push({ bot: bot.name, result: '✅ Sent & Deleted', success: true });
                } else {
                    results.push({ bot: bot.name, result: '✅ Sent', success: true });
                }
            } catch (err) {
                results.push({ bot: bot.name, result: `❌ ${err.message}`, success: false });
            }
        });

        await Promise.all(promises);

        const summary = results.map(r => `[${r.bot}] ${r.result}`).join('\n');
        const allSuccess = results.every(r => r.success);
        socket.emit('commandResult', {
            bot: `${results.length} bots`,
            command: 'Mass DM',
            result: summary,
            success: allSuccess,
        });
    });

    socket.on('updateBotNote', ({ botIndex, note }) => {
        if (!socket.rooms.has('authed')) return;
        if (botIndex < 0 || botIndex >= config.bots.length) return;
        config.bots[botIndex].note = note;
        saveConfig();
    });

    socket.on('updateBotSettings', ({ botIndex, key, value }) => {
        if (!socket.rooms.has('authed')) return;
        if (botIndex < 0 || botIndex >= config.bots.length) return;
        if (!config.bots[botIndex].settings) config.bots[botIndex].settings = {};
        config.bots[botIndex].settings[key] = value;
        saveConfig();
        logToConsole('info', 'WEB', `Setting updated → [${config.bots[botIndex].name}] ${key} = ${value}`);
    });

    socket.on('massLoad', ({ botIndices }) => {
        if (!socket.rooms.has('authed')) return;
        if (!Array.isArray(botIndices) || botIndices.length === 0) return;
        let loadedCount = 0;
        botIndices.forEach(idx => {
            if (idx >= 0 && idx < config.bots.length) {
                if (!activeBots[idx]) {
                    const botCfg = config.bots[idx];
                    logToConsole('info', 'WEB', `Loading bot: ${botCfg.name} (#${idx})...`);
                    const instance = createBot(botCfg, idx);
                    if (instance) {
                        activeBots[idx] = instance;
                        loadedCount++;
                    }
                }
            }
        });
        socket.emit('commandResult', { bot: 'System', command: 'Mass Load', result: `✅ Loaded ${loadedCount} bots`, success: true });
        io.to('authed').emit('botStatuses', getStatusesData());
    });

    socket.on('massUpdateSettings', ({ botIndices, settings }) => {
        if (!socket.rooms.has('authed')) return;
        if (!Array.isArray(botIndices) || botIndices.length === 0) return;
        botIndices.forEach(idx => {
            if (idx >= 0 && idx < config.bots.length) {
                if (!config.bots[idx].settings) config.bots[idx].settings = {};
                Object.assign(config.bots[idx].settings, settings);
            }
        });
        saveConfig();
        socket.emit('commandResult', { bot: 'System', command: 'Mass Settings', result: `✅ Settings applied to selected bots`, success: true });
        io.to('authed').emit('botStatuses', getStatusesData());
    });

    socket.on('massUpdatePlatform', ({ botIndices, platform }) => {
        if (!socket.rooms.has('authed')) return;
        if (!Array.isArray(botIndices) || botIndices.length === 0) return;
        if (!PLATFORMS[platform]) return;
        botIndices.forEach(idx => {
            if (idx >= 0 && idx < config.bots.length) {
                config.bots[idx].platform = platform;
                if (activeBots[idx]) {
                    try { activeBots[idx].client.destroy(); } catch (_) {}
                    const instance = createBot(config.bots[idx], idx);
                    activeBots[idx] = instance;
                }
            }
        });
        saveConfig();
        socket.emit('commandResult', { bot: 'System', command: 'Mass Platform', result: `✅ Platform updated & restarted selected bots`, success: true });
        io.to('authed').emit('botStatuses', getStatusesData());
    });

    socket.on('massUpdatePresence', async ({ botIndices, presence }) => {
        if (!socket.rooms.has('authed')) return;
        if (!Array.isArray(botIndices) || botIndices.length === 0) return;
        if (!['online', 'idle', 'dnd', 'streaming', 'invisible'].includes(presence)) return;
        const results = [];
        const promises = botIndices.map(async (idx) => {
            if (idx < 0 || idx >= activeBots.length || !activeBots[idx]) return;
            const bot = activeBots[idx];
            const res = await bot.processWebCommand(`set presence ${presence}`);
            results.push({ bot: bot.name, result: res });
        });
        await Promise.all(promises);
        socket.emit('commandResult', { bot: 'System', command: 'Mass Presence', result: `✅ Set presence to ${presence} for selected bots`, success: true });
        io.to('authed').emit('botStatuses', getStatusesData());
    });

    socket.on('addUser', async ({ userId }) => {
        if (!socket.rooms.has('authed')) return;
        if (!userId || trustedUsers.includes(userId) || userId === OWNER_ID) return;
        trustedUsers.push(userId); saveTrustedUsers(trustedUsers);
        let n = userId;
        const firstActive = activeBots.find(b => b);
        if (firstActive) { try { n = (await firstActive.client.users.fetch(userId)).tag; } catch (_) {} }
        logToConsole('info', 'WEB', `Trusted user added: ${n}(${userId})`);
        emitTrustedUsers(io.to('authed'));
        socket.emit('commandResult', { bot: 'System', command: 'Add user', result: `✅ Added ${n}`, success: true });
    });

    socket.on('removeUser', async ({ userId }) => {
        if (!socket.rooms.has('authed')) return;
        if (!trustedUsers.includes(userId)) return;
        trustedUsers = trustedUsers.filter(id => id !== userId); saveTrustedUsers(trustedUsers);
        let n = userId;
        const firstActive = activeBots.find(b => b);
        if (firstActive) { try { n = (await firstActive.client.users.fetch(userId)).tag; } catch (_) {} }
        logToConsole('info', 'WEB', `Trusted user removed: ${n}(${userId})`);
        emitTrustedUsers(io.to('authed'));
    });

    socket.on('disconnect', () => logToConsole('info', 'WEB', `Disconnected: ${socket.id}`));
});

async function emitTrustedUsers(target) {
    const users = [];
    const firstActive = activeBots.find(b => b);
    for (const id of trustedUsers) {
        let t = id;
        if (firstActive) { try { t = (await firstActive.client.users.fetch(id)).tag; } catch (_) {} }
        users.push({ id, tag: t });
    }
    target.emit('trustedUsers', users);
}

setInterval(() => { io.to('authed').emit('botStatuses', getStatusesData()); }, 3000);

server.listen(WEB_PORT, () => logToConsole('info', 'WEB', `Control panel: http://localhost:${WEB_PORT}`));

//  Console Commands 
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: '' });
console.log(' Console: msg <text> | msg <bot#> <text> | list | help\n');

rl.on('line', async (input) => {
    const line = input.trim(); if (!line) return;
    if (line.toLowerCase() === 'help') { console.log('\n  msg <text>        DM owner\n  msg <#> <text>    DM via bot #\n  list              Show bots\n'); return; }
    if (line.toLowerCase() === 'list') {
        console.log('');
        activeBots.forEach((b, i) => {
            if (!b) {
                console.log(`  ❌ ${i + 1}. [Unloaded]`);
            } else {
                console.log(`  ${b.client?.user ? '✅' : '⏳'} ${i + 1}. ${b.name} — ${b.client?.user?.tag || 'not ready'}`);
            }
        });
        console.log('');
        return;
    }
    if (line.toLowerCase().startsWith('msg ')) {
        const rest = line.slice(4).trim(); if (!rest) return;
        let bi = 0, mt = rest; const parts = rest.split(/\s+/); const num = parseInt(parts[0], 10);
        if (!isNaN(num) && num >= 1 && num <= activeBots.length && parts.length > 1) { bi = num - 1; mt = parts.slice(1).join(' '); }
        const bot = activeBots[bi]; if (!bot?.client?.user) { console.log('⚠️  Not ready or bot is unloaded'); return; }
        try { const o = await bot.client.users.fetch(OWNER_ID); const dm = await o.createDM(); await dm.send(mt); console.log(`✅ [${bot.name}] → ${o.tag}: "${mt}"`); }
        catch (err) { console.warn(`⚠️  ${err.message}`); }
        return;
    }
    console.log('⚠️  Unknown. Type "help".');
});
