# Discord Client Bot Hub

A multi-account Discord self-bot manager with a real-time web control panel. Control dozens of user-token bots from a single dashboard - manage voice channels, send DMs, update presence, send friend requests, and more.

---

## ✨ Features

### 🤖 Multi-Bot Management
- Run **unlimited** user-token bots from a single Node.js process
- Add, edit, reload, and unload bots at runtime - no restarts needed
- Per-bot settings (notifications, platform, presence) persisted to `config.json`

### 🎛️ Web Control Panel
- **Premium dark-mode SaaS UI** with collapsible sidebar navigation
- **Dashboard** - live bot grid with status, voice state, servers, uptime, and avatar
- **Command Hub** - mass-execute commands across selected bots with checkbox targeting
- **Console Log** - full-screen developer terminal with color-coded log levels
- **Mass Settings** - batch configure notifications, platform, and presence status
- **App Settings** - toggle notification categories (connection, VC, commands, console)
- **Trusted Whitelist** - manage authorized users who can DM-control your bots
- **Filters** - filter bots by Server ID, loaded/unloaded status, or show hidden bots
- **Toast Notifications** - minimal bottom-right alerts with colored status indicators

### 🔊 Voice Control
- Join/leave voice channels via web panel or DM commands
- Self-mute and self-deafen toggles
- Real-time voice state tracking with move/disconnect notifications
- Rejoin last channel with one click

### 📨 Mass Operations
- **Mass DM** - broadcast messages to a target user from all selected bots
- **Mass Friend Request** - sequential one-by-one friend requests with staggered delays (1–5s)
- **Mass Load / Unload** - batch start or stop bots
- **Mass Presence** - set all bots to Online, Idle, DND, Streaming, or Invisible
- **Mass Platform** - switch all bots between Desktop, Mobile, Browser, or VR
- Auto-delete sent DMs (optional checkbox)
- Configurable stagger delay range (e.g. `2-5` seconds)

### 🔐 Access Control
- Password-protected web panel (session-based)
- Owner-only trusted user management
- DM commands restricted to owner + whitelisted users

### 🛡️ Rate Limit Protection
- Friend requests execute sequentially (not concurrently) with random delays
- Mass DMs stagger per-bot with configurable delay ranges
- Direct Discord REST API calls with proper client-mimicking headers to avoid captcha blocks

---

## 📋 Requirements

- **Node.js** v16.9.0 or higher
- **npm** (bundled with Node.js)
- Discord **user tokens** (not bot tokens)

---

## 🚀 Quick Start

### 1. Clone & Install

```bash
git clone <your-repo-url>
cd Discord-Client-Bot
npm install
```

### 2. Configure

Create a `config.json` file in the project root:

```json
{
  "owner_id": "YOUR_DISCORD_USER_ID",
  "web_port": 3000,
  "web_password": "your_secure_password",
  "bots": [
    {
      "name": "Bot 1",
      "token": "USER_TOKEN_HERE",
      "platform": "desktop"
    },
    {
      "name": "Bot 2",
      "token": "USER_TOKEN_HERE",
      "platform": "mobile"
    }
  ]
}
```

| Field | Description |
|---|---|
| `owner_id` | Your Discord user ID (has full admin access) |
| `web_port` | Port for the web control panel (default: `3000`) |
| `web_password` | Password to access the web panel |
| `bots[]` | Array of bot account configurations |
| `bots[].name` | Display name for the bot |
| `bots[].token` | Discord user token |
| `bots[].platform` | Client emulation: `desktop`, `mobile`, `browser`, or `vr` |

### 3. Run

```bash
npm start
```

Then open `http://localhost:3000` (or your VPS IP) in your browser.

---

## 💬 DM Commands

Send these commands as a direct message to any of your running bots.

### Voice
| Command | Description |
|---|---|
| `join vc <server_id> <channel_id>` | Join a voice channel |
| `leave vc` | Leave the current voice channel |
| `mute` / `unmute` | Toggle self-mute |
| `deafen` / `undeafen` | Toggle self-deafen |

### Servers & Info
| Command | Description |
|---|---|
| `status` | Show bot status (voice, platform, servers, uptime) |
| `servers` | List all servers the bot is in |
| `channels <server_id>` | List voice channels in a server |
| `leave <server_id>` | Leave a server |
| `ping` | Check latency |
| `uptime` | Show bot uptime |

### Settings
| Command | Description |
|---|---|
| `set status <text>` | Set a custom playing status |
| `set platform <desktop\|mobile\|browser\|vr>` | Change client platform (reconnects) |
| `friend request <user_id>` | Send a friend request |

### Owner Only
| Command | Description |
|---|---|
| `add user <id>` | Whitelist a user for DM control |
| `remove user <id>` | Remove a whitelisted user |
| `list users` | Show all trusted users |

---

## 🖥️ Web Panel Commands

Type these in the **Command Hub → Run Console Commands** input field:

```
join vc <server_id> <channel_id>
leave vc
leave <server_id>
mute / unmute
deafen / undeafen
status
servers
channels <server_id>
ping
uptime
set status <text>
set presence <online|idle|dnd|streaming|invisible>
set platform <desktop|mobile|browser|vr>
friend request <user_id>
```

---

## 📁 Project Structure

```
Discord Client Bot/
├── index.js              # Main server - bot instances, socket handlers, Discord API
├── config.json           # Bot tokens, owner ID, web password (gitignored)
├── trusted_users.json    # Whitelisted user IDs (auto-generated, gitignored)
├── package.json          # Dependencies and scripts
├── .gitignore
├── .env                  # Environment variables (optional)
└── public/
    ├── index.html        # Web panel markup (sidebar, modals, tabs)
    ├── style.css         # Dark-mode theme, glassmorphism, animations
    └── script.js         # Client-side logic, socket.io, DOM management
```

---

## ⚙️ Architecture

```
┌─────────────────────────────────────────────────┐
│                  Browser (Web Panel)            │
│  public/index.html + style.css + script.js      │
│          ↕ socket.io (real-time)                │
├─────────────────────────────────────────────────┤
│               Node.js Server (index.js)         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │  Bot #1  │  │  Bot #2  │  │  Bot #N  │      │
│  │  Client  │  │  Client  │  │  Client  │      │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘      │
│       └──────────────┼──────────────┘            │
│                      ↕                          │
│            Discord Gateway (WSS)                │
│            Discord REST API (HTTPS)             │
└─────────────────────────────────────────────────┘
```

- **Each bot** runs as a `discord.js-selfbot-v13` Client instance
- **Socket.IO** provides real-time bidirectional updates between the panel and server
- **Express** serves the static web panel files
- **Direct HTTPS calls** to `discord.com/api/v9` for sensitive operations (friend requests) with proper client-mimicking headers

---

## 🔧 Platform Emulation

Each bot can impersonate a different Discord client:

| Key | Emulates | WS Properties |
|---|---|---|
| `desktop` | Discord Desktop (Windows) | `os: Windows, browser: Discord Client` |
| `mobile` | Discord iOS | `os: iOS, browser: Discord iOS` |
| `browser` | Discord Web (Chrome) | `os: Windows, browser: Chrome` |
| `vr` | Discord on Quest | `os: Quest, browser: Discord Embedded` |

Changing platform requires a reconnect - the bot will disconnect and re-login with the new properties.

---

## 🔔 Notification System

The web panel has configurable toast notifications (bottom-right):

| Category | Events |
|---|---|
| **Connection** | Bot login, disconnect, load, unload |
| **Voice Channel** | VC joins, moves, disconnects |
| **Commands** | Mass command results (success/failure) |
| **Console** | Warnings and errors from bot logs |

All categories can be individually toggled in **Settings → App Settings**.

---

## 🛡️ Security Notes

- **Change the default password** (`changeme`) before exposing the web panel.
- **Use a reverse proxy** (nginx/Caddy) with HTTPS if running on a public VPS.
- Self-botting is against Discord's Terms of Service - use at your own risk.

---

## 📦 Dependencies

| Package | Purpose |
|---|---|
| `discord.js-selfbot-v13` | Discord self-bot client library |
| `express` | HTTP server for the web panel |
| `socket.io` | Real-time WebSocket communication |
| `dotenv` | Environment variable loading |
| `debug` | Debug logging utility |

---

## 📄 License

This project is for educational purposes only. Use responsibly and at your own risk.
