# Discord Client Bot Hub

A multi-account Discord self-bot manager with a real-time web control panel. Control dozens of user-token bots from a single dashboard — manage voice channels, send DMs, update presence, send friend requests, and more.

---

## ✨ Features

### 🤖 Multi-Bot Management
- Run **unlimited** user-token bots from a single Node.js process.
- Add, edit, reload, and unload bots at runtime — no restarts needed.
- **Startup Disabling**: Configure specific bots to remain unloaded when the script boots up.
- Per-bot settings (notifications, platform, presence) persisted to `config.json`.

### 🎛️ Web Control Panel
- **Premium dark-mode SaaS UI** with collapsible sidebar navigation and glassmorphism.
- **Dashboard** — live bot grid with status, voice state, servers, uptime, and avatar.
- **Command Hub** — mass-execute commands across selected bots with checkbox targeting.
- **Console Log** — full-screen developer terminal with color-coded log levels.
- **Mass Settings** — batch configure notifications, platform, and presence status.
- **App Settings** — configure custom branding, filter failed bots, and adjust notification timeouts.
- **Trusted Whitelist** — manage authorized users who can DM-control your bots.
- **Smart Filters** — filter bots by Server ID, loaded/unloaded status, or show hidden bots.
- **Toast Notifications** — minimal bottom-right alerts with customizable duration and hover-pause physics.

### 🔊 Voice Control
- Join/leave voice channels via web panel or DM commands.
- Self-mute and self-deafen toggles.
- Real-time voice state tracking with move/disconnect notifications.
- Rejoin last channel with one click.

### 📨 Mass Operations
- **Mass DM** — broadcast messages to a target user from all selected bots.
- **Advanced Delay Slider** — Set overlapping min/max stagger delays with runtime estimations to avoid rate-limits.
- **Mass Load / Unload** — batch start or stop bots.
- **Mass Presence** — set all bots to Online, Idle, DND, Streaming, or Invisible.
- **Mass Platform** — switch all bots between Desktop, Mobile, Browser, or VR.
- Auto-delete sent DMs (optional checkbox).

### 🔐 Access Control
- Password-protected web panel (session-based).
- Owner-only trusted user management.
- DM commands restricted to owner + whitelisted users.

### 🛡️ Rate Limit Protection
- Friend requests execute sequentially (not concurrently) with random delays.
- Mass DMs stagger per-bot with mathematically averaged min/max delay ranges.
- Direct Discord REST API calls with proper client-mimicking headers to avoid captcha blocks.

---

## 📅 Update Version Logs

### v1.1.1 - Core Reliability & Layout Polish (Latest)
- **Advanced Delay Range Slider**: Added a double-thumb slider allowing for precise min-max stagger delays during mass operations, complete with broadcast runtime estimations.
- **Startup Execution Control**: Added a "Disabled on startup" toggle in both the Add Bot FAB and Edit Bot credentials modals to prevent specific bots from connecting when the backend launches.
- **Toast Notification Physics**: Integrated custom timeout intervals (3s, 5s, 10s, 15s, Keep Visible) with mouse-hover pause physics.
- **Flicker-Free Grid Updates**: Rebuilt the DOM sorting engine in `script.js`. Swapped strict element checking to eliminate background DOM thrashing, ensuring scroll positions, inputs, and animations are perfectly preserved while syncing statuses.
- **UI Streamlining**: Moved the "Remove Bot" functionality directly into the Edit Bot modal footer. Optimized Toast entry animations for a sleek single-line aesthetic.
- **Session Preservation**: Self-bots now correctly inherit manual custom presence states (e.g., Do Not Disturb) on connection instead of defaulting to Online.

### v1.1.0 - Features, Filters & Presets
- **Remove Bot & Confirmation**: Added the ability to permanently delete bots from the configuration, backed by a confirmation modal to prevent accidental deletion.
- **Enhanced Status Filters**: Expanded the dashboard status filter to include "Failed" bots. Added a "Show failed bots first" setting.
- **Smart Search Upgrades**: The search bar now supports searching by `serverid:<id>`, bot name, username, and custom notes.
- **Command Presets**: Command Hub now supports custom operator-defined command presets. Click to execute instantly, or hold `Shift` + click to paste into the input field for editing.
- **Persistent Unloaded State**: Bots now remember and display their last known avatar and server count even when unloaded.
- **Custom App Branding**: Added settings to dynamically rename the dashboard's "BotHub" title and subtitle directly from the UI.
- **Expandable Add Bot FAB**: Replaced the static Add Bot interface with a modern floating action button (FAB) in the bottom right corner featuring smooth expansion animations.
- **Stealth Friend Requests**: Replaced unnatural mass-friend request code with direct HTTPS requests that perfectly mimic the official Discord client API to bypass captcha and anti-bot systems.

### v1.0.0 - Initial Release
- Multi-bot client launcher using `discord.js-selfbot-v13`.
- Express & Socket.IO real-time backend.
- Premium UI with live connection dots, grid dashboard, console logs, and core mass commands.

---

## 📋 Requirements

- **Node.js** v16.9.0 or higher
- **npm** (bundled with Node.js)
- Discord **user tokens** (not bot tokens)

---

## 🚀 Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/KrexonTX/DiscordClientHub
cd DiscordClientHub-main
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

### 3. Run

```bash
npm start
```

Then open `http://localhost:3000` (or your VPS IP) in your browser.

---

## 💬 DM Commands

Send these commands as a direct message to any of your running bots.

| Category | Commands | Description |
|---|---|---|
| **Voice** | `join vc <server> <channel>`, `leave vc`, `mute`, `deafen` | Join/leave and toggle voice states |
| **Servers** | `status`, `servers`, `channels <server>`, `leave <server>`, `ping`, `uptime` | General lookup and latency checks |
| **Settings** | `set status <text>`, `set platform <desktop|mobile>`, `friend request <user>` | Account setting modification |
| **Owner** | `add user <id>`, `remove user <id>`, `list users` | Access management for trusted users |

---

## 🖥️ Web Panel Commands

Type these in the **Command Hub → Run Console Commands** input field:

```text
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
├── index.js              # Main server — bot instances, socket handlers, Discord API
├── config.json           # Bot tokens, owner ID, web password (gitignored)
├── trusted_users.json    # Whitelisted user IDs (auto-generated, gitignored)
├── package.json          # Dependencies and scripts
└── public/
    ├── index.html        # Web panel markup (sidebar, modals, tabs)
    ├── style.css         # Dark-mode theme, glassmorphism, animations
    └── script.js         # Client-side logic, socket.io, DOM management
```

---

## ⚙️ Architecture

- **Each bot** runs as a `discord.js-selfbot-v13` Client instance.
- **Socket.IO** provides real-time bidirectional updates between the panel and server.
- **Express** serves the static web panel files.
- **Direct HTTPS calls** to `discord.com/api/v9` for sensitive operations (friend requests) with proper client-mimicking headers.

---

## 🔧 Platform Emulation

Each bot can impersonate a different Discord client:

| Key | Emulates | WS Properties |
|---|---|---|
| `desktop` | Discord Desktop (Windows) | `os: Windows, browser: Discord Client` |
| `mobile` | Discord iOS | `os: iOS, browser: Discord iOS` |
| `browser` | Discord Web (Chrome) | `os: Windows, browser: Chrome` |
| `vr` | Discord on Quest | `os: Quest, browser: Discord Embedded` |

Changing platform requires a reconnect — the bot will disconnect and re-login with the new properties.

---

## 🛡️ Security Notes

- **Change the default password** (`changeme`) before exposing the web panel.
- **Use a reverse proxy** (nginx/Caddy) with HTTPS if running on a public VPS.
- Self-botting is against Discord's Terms of Service — use at your own risk.

---

## 📄 License

This project is for educational purposes only. Use responsibly and at your own risk.
