/* ═══════════════════════════════════════════════════
   Discord Bot Control Panel — Client Script v4
   ═══════════════════════════════════════════════════ */

(() => {
  'use strict';

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => (root || document).querySelectorAll(sel);

  // ── DOM refs ──
  const dom = {
    loginOverlay:   $('#loginOverlay'),
    loginCard:      $('#loginCard'),
    passwordInput:  $('#passwordInput'),
    loginBtn:       $('#loginBtn'),
    loginError:     $('#loginError'),

    dashboard:      $('#dashboard'),
    connectionDot:  $('#connectionDot'),
    connectionText: $('#connectionText'),
    breadParent:    $('#breadParent'),
    breadChild:     $('#breadChild'),
    panelUserMeta:  $('#panelUserMeta'),

    botGrid:        $('#botGrid'),
    botCount:       $('#botCount'),
    botsEmpty:      $('#botsEmpty'),
    addBotCard:     $('#addBotCard'),
    targetBotsWidget: $('#targetBotsWidget'),
    showHiddenBots: $('#showHiddenBots'),
    filterServerId: $('#filterServerId'),
    filterStatus:   $('#filterStatus'),
    settingNotifyEnabled: $('#settingNotifyEnabled'),
    settingNotifyConnection: $('#settingNotifyConnection'),
    settingNotifyVc: $('#settingNotifyVc'),
    settingNotifyCommand: $('#settingNotifyCommand'),
    settingNotifyConsole: $('#settingNotifyConsole'),
    selectAllBotsBtn: $('#selectAllBotsBtn'),
    deselectAllBotsBtn: $('#deselectAllBotsBtn'),
    commandInput:   $('#commandInput'),
    sendCommandBtn: $('#sendCommandBtn'),
    commandResult:  $('#commandResult'),
    massLoadBtn:    $('#massLoadBtn'),
    massUnloadBtn:  $('#massUnloadBtn'),
    massDmBtn:      $('#massDmBtn'),
    massDmUserId:   $('#massDmUserId'),
    massDmMessage:  $('#massDmMessage'),
    massDmDeleteCheck: $('#massDmDeleteCheck'),
    massDmDelayInput: $('#massDmDelayInput'),
    massNotifyOnMove: $('#massNotifyOnMove'),
    massNotifyOnDisconnect: $('#massNotifyOnDisconnect'),
    applyMassSettingsBtn: $('#applyMassSettingsBtn'),
    massPlatformSelect: $('#massPlatformSelect'),
    applyMassPlatformBtn: $('#applyMassPlatformBtn'),
    massPresenceSelect: $('#massPresenceSelect'),
    applyMassPresenceBtn: $('#applyMassPresenceBtn'),
    consoleEntries: $('#consoleEntries'),
    clearConsoleBtn:$('#clearConsoleBtn'),

    trustedList:    $('#trustedList'),
    addUserInput:   $('#addUserInput'),
    addUserBtn:     $('#addUserBtn'),

    // Join VC modal
    joinVcModal:       $('#joinVcModal'),
    joinVcClose:       $('#joinVcClose'),
    joinVcCancelBtn:   $('#joinVcCancelBtn'),
    joinVcConfirmBtn:  $('#joinVcConfirmBtn'),
    joinVcRejoin:      $('#joinVcRejoin'),
    vcServerSelect:    $('#vcServerSelect'),
    vcChannelSelect:   $('#vcChannelSelect'),

    // Add Bot modal
    addBotModal:       $('#addBotModal'),
    addBotClose:       $('#addBotClose'),
    addBotCancelBtn:   $('#addBotCancelBtn'),
    addBotSubmitBtn:   $('#addBotSubmitBtn'),
    addBotName:        $('#addBotName'),
    addBotToken:       $('#addBotToken'),
    addBotPlatform:    $('#addBotPlatform'),

    // Edit Bot modal
    editBotModal:       $('#editBotModal'),
    editBotClose:       $('#editBotClose'),
    editBotCancelBtn:   $('#editBotCancelBtn'),
    editBotSubmitBtn:   $('#editBotSubmitBtn'),
    editBotIndex:       $('#editBotIndex'),
    editBotName:        $('#editBotName'),
    editBotToken:       $('#editBotToken'),
    editBotPlatform:    $('#editBotPlatform'),
    editBotReload:      $('#editBotReload'),
  };

  // ── State ──
  const MAX_CONSOLE = 200;
  let botStatuses = [];
  let authenticated = false;
  let joinVcBotIndex = null;   // currently-open modal target
  const noteTimers = {};       // debounce timers for notes
  let firstStatusLoad = true;

  // ── Socket ──
  const socket = io({ autoConnect: false });

  // ══════════════════════════════════════════
  //  CONNECTION STATUS
  // ══════════════════════════════════════════
  function setStatus(state, text) {
    dom.connectionDot.className = 'status-dot';
    if (state === 'connected') dom.connectionDot.classList.add('connected');
    else if (state === 'error') dom.connectionDot.classList.add('error');
    dom.connectionText.textContent = text || state;
  }

  socket.on('connect', () => {
    setStatus('connected', 'Connected');
    const pw = sessionStorage.getItem('cp_auth');
    if (pw && !authenticated) socket.emit('auth', { password: pw });
    if (authenticated) socket.emit('requestStatuses');
  });
  socket.on('disconnect', () => setStatus('error', 'Disconnected'));
  socket.on('connect_error', () => setStatus('error', 'Connection error'));

  // ══════════════════════════════════════════
  //  AUTHENTICATION
  // ══════════════════════════════════════════
  function attemptLogin() {
    const password = dom.passwordInput.value.trim();
    if (!password) { showLoginError('Please enter a password'); return; }
    dom.loginBtn.classList.add('loading');
    dom.loginError.textContent = '';
    socket.emit('auth', { password });
  }

  socket.on('authResult', (data) => {
    dom.loginBtn.classList.remove('loading');
    if (data.success) {
      authenticated = true;
      const pwToStore = dom.passwordInput.value.trim() || sessionStorage.getItem('cp_auth');
      if (pwToStore) sessionStorage.setItem('cp_auth', pwToStore);
      showDashboard();
      socket.emit('requestStatuses');
    } else {
      showLoginError('Invalid password');
      sessionStorage.removeItem('cp_auth');
    }
  });

  function showLoginError(msg) {
    dom.loginError.textContent = msg;
    dom.loginCard.style.animation = 'none';
    void dom.loginCard.offsetHeight;
    dom.loginCard.style.animation = 'shake 0.4s ease';
  }

  const shakeCSS = document.createElement('style');
  shakeCSS.textContent = `@keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-4px)}80%{transform:translateX(4px)}}`;
  document.head.appendChild(shakeCSS);

  function showDashboard() {
    dom.loginOverlay.classList.add('fade-out');
    dom.dashboard.classList.remove('hidden');
    setTimeout(() => { dom.loginOverlay.style.display = 'none'; }, 500);
  }

  dom.loginBtn.addEventListener('click', attemptLogin);
  dom.passwordInput.addEventListener('keydown', e => { if (e.key === 'Enter') attemptLogin(); });

  // ══════════════════════════════════════════
  //  BOT STATUSES — FLICKER-FREE UPDATES
  // ══════════════════════════════════════════
  socket.on('botStatuses', (statuses) => {
    const oldMap = new Map((botStatuses || []).map(b => [b.index, b]));
    
    // Check status changes to trigger toasts if enabled
    if (!firstStatusLoad && dom.settingNotifyEnabled && dom.settingNotifyEnabled.checked) {
      statuses.forEach(bot => {
        const oldBot = oldMap.get(bot.index);
        if (oldBot) {
          // Connection changes
          if (dom.settingNotifyConnection && dom.settingNotifyConnection.checked) {
            if (oldBot.unloaded && !bot.unloaded) {
              showToast('success', `${bot.name} Loaded`, `Bot has successfully logged in and is now online.`);
            } else if (!oldBot.unloaded && bot.unloaded) {
              showToast('warning', `${bot.name} Unloaded`, `Bot has disconnected and is now unloaded.`);
            } else if (!oldBot.ready && bot.ready) {
              showToast('success', `${bot.name} Online`, `Bot has completed login and is ready.`);
            } else if (oldBot.ready && !bot.ready && !bot.unloaded) {
              showToast('warning', `${bot.name} Disconnected`, `Bot lost connection to Discord.`);
            }
          }
          // Voice state changes
          if (dom.settingNotifyVc && dom.settingNotifyVc.checked) {
            const oldCh = oldBot.voice?.channel;
            const newCh = bot.voice?.channel;
            if (newCh && oldCh !== newCh) {
              showToast('info', `${bot.name} Moved VC`, `Moved to channel: ${newCh} in ${bot.voice.guild || 'Server'}`);
            } else if (oldCh && !newCh) {
              showToast('warning', `${bot.name} Left VC`, `Disconnected from voice channel: ${oldCh}`);
            }
          }
        }
      });
    }

    botStatuses = statuses;
    updateBotGrid(statuses);
    updateTargetBotsWidget(statuses);

    // Update sidebar profile meta
    const total = statuses.length;
    const loaded = statuses.filter(b => !b.unloaded).length;
    if (dom.panelUserMeta) {
      dom.panelUserMeta.textContent = `${loaded} Loaded / ${total} Total`;
    }
  });

  function updateBotGrid(bots) {
    const filterVal = dom.filterServerId ? dom.filterServerId.value.trim() : '';
    const filterStatusVal = dom.filterStatus ? dom.filterStatus.value : 'all';
    dom.botCount.textContent = `${bots.length} bot${bots.length !== 1 ? 's' : ''}`;

    // Show / hide empty state
    if (bots.length === 0) {
      dom.botsEmpty.classList.remove('hidden');
    } else {
      dom.botsEmpty.classList.add('hidden');
    }

    const existingCards = new Map();
    dom.botGrid.querySelectorAll('.bot-card[data-bot-index]').forEach(c => {
      existingCards.set(c.dataset.botIndex, c);
    });

    const seenIndices = new Set();

    bots.forEach(bot => {
      const key = String(bot.index);
      seenIndices.add(key);
      let card = existingCards.get(key);

      if (card) {
        // In-place update — NO recreating the card element
        updateCardContent(card, bot);
      } else {
        // New card
        card = document.createElement('div');
        card.className = 'bot-card glass-card new-card';
        card.dataset.botIndex = key;
        card.innerHTML = buildCardInner(bot);
        attachCardListeners(card, bot);
        updateCardContent(card, bot);
        // Insert before addBotCard
        dom.botGrid.insertBefore(card, dom.addBotCard);
        // Remove new-card animation class after it plays
        setTimeout(() => card.classList.remove('new-card'), 450);
      }

      // Optional server ID filter and loaded status filter
      let matches = true;
      if (filterVal) {
        if (bot.unloaded) {
          matches = false;
        } else {
          matches = Array.isArray(bot.guildIds) && bot.guildIds.includes(filterVal);
        }
      }
      
      if (matches) {
        if (filterStatusVal === 'loaded') {
          matches = !bot.unloaded;
        } else if (filterStatusVal === 'unloaded') {
          matches = !!bot.unloaded;
        }
      }

      card.classList.toggle('hidden', !matches);
    });

    // Remove cards for bots that no longer exist
    existingCards.forEach((card, key) => {
      if (!seenIndices.has(key)) card.remove();
    });
  }

  // ── Render multi-select checkboxes checklist ──
  function updateTargetBotsWidget(bots) {
    const showHidden = dom.showHiddenBots ? dom.showHiddenBots.checked : false;
    const filterVal = dom.filterServerId ? dom.filterServerId.value.trim() : '';
    const filterStatusVal = dom.filterStatus ? dom.filterStatus.value : 'all';
    const currentlyChecked = new Set(
      Array.from($$('#targetBotsWidget input[type="checkbox"]:checked')).map(cb => cb.value)
    );
    dom.targetBotsWidget.innerHTML = '';
    if (bots.length === 0) {
      dom.targetBotsWidget.innerHTML = '<div class="empty-state-sm" style="padding: 10px; font-size: 0.8rem;">No bots loaded</div>';
      return;
    }

    const visibleBots = bots.filter(bot => {
      if (showHidden) return true;
      let matches = true;
      if (filterVal) {
        if (bot.unloaded) {
          matches = false;
        } else {
          matches = Array.isArray(bot.guildIds) && bot.guildIds.includes(filterVal);
        }
      }
      if (matches) {
        if (filterStatusVal === 'loaded') {
          matches = !bot.unloaded;
        } else if (filterStatusVal === 'unloaded') {
          matches = !!bot.unloaded;
        }
      }
      return matches;
    });

    if (visibleBots.length === 0) {
      dom.targetBotsWidget.innerHTML = '<div class="empty-state-sm" style="padding: 10px; font-size: 0.8rem; color: var(--text-muted);">No matching bots</div>';
      return;
    }

    visibleBots.forEach(bot => {
      const label = document.createElement('label');
      label.className = 'target-bot-checkbox-label';
      const isChecked = firstStatusLoad || currentlyChecked.has(String(bot.index));
      label.innerHTML = `
        <input type="checkbox" value="${bot.index}" ${isChecked ? 'checked' : ''} />
        <span>${esc(bot.name || 'Bot')} (${esc(bot.tag || '—')})</span>
      `;
      dom.targetBotsWidget.appendChild(label);
    });
    firstStatusLoad = false;
  }

  dom.selectAllBotsBtn.addEventListener('click', () => {
    $$('#targetBotsWidget input[type="checkbox"]').forEach(cb => cb.checked = true);
  });
  dom.deselectAllBotsBtn.addEventListener('click', () => {
    $$('#targetBotsWidget input[type="checkbox"]').forEach(cb => cb.checked = false);
  });

  // ── Build card HTML ──
  function buildCardInner(bot) {
    const isOnline = bot.ready;
    const initials = (bot.name || '?').slice(0, 2).toUpperCase();
    const avatarContent = bot.avatarUrl
      ? `<img src="${escapeAttr(bot.avatarUrl)}" alt="" onerror="this.parentElement.textContent='${initials}'">`
      : initials;
    const uptime = formatUptime(bot.uptime);
    const serverCount = bot.servers != null ? bot.servers.toLocaleString() : '—';
    const platform = bot.platform || bot.platformKey || '—';

    let voiceHTML;
    if (bot.voice) {
      const ch = bot.voice.channel || 'Unknown';
      const gd = bot.voice.guild || '';
      voiceHTML = `
        <div class="bot-voice">
          <div class="bot-voice-label">Voice</div>
          <div class="bot-voice-value">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 010 7.07"/></svg>
            ${esc(ch)}${gd ? ` <span style="color:var(--text-muted)">· ${esc(gd)}</span>` : ''}
          </div>
          <div class="voice-indicators">
            <span class="voice-indicator ${bot.voice.muted ? 'active' : 'inactive'}">Muted</span>
            <span class="voice-indicator ${bot.voice.deafened ? 'active' : 'inactive'}">Deafened</span>
          </div>
        </div>`;
    } else {
      voiceHTML = `<div class="bot-voice"><div class="bot-voice-label">Voice</div><div class="bot-voice-value" style="color:var(--text-muted)">Not connected</div></div>`;
    }

    const isMuted = bot.voice?.muted;
    const isDeaf = bot.voice?.deafened;
    const noteText = bot.note || '';
    const notifyMove = bot.settings?.notifyOnMove !== false;
    const notifyDC = bot.settings?.notifyOnDisconnect !== false;

    return `
      <div class="bot-card-header">
        <div class="bot-avatar" data-ref="avatar">${avatarContent}</div>
        <div class="bot-name-group">
          <div class="bot-name"><span class="bot-status-dot ${isOnline ? 'online' : ''}" data-ref="statusDot"></span><span data-ref="botName">${esc(bot.name || 'Unknown')}</span></div>
          <div class="bot-tag" data-ref="botTag">${esc(bot.tag || '—')}</div>
        </div>
        <div class="bot-card-actions-top">
          ${bot.unloaded
            ? `<button class="btn-card-top" data-action="reload" data-tooltip="Load Bot"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg></button>`
            : `<button class="btn-card-top" data-action="reload" data-tooltip="Reload Bot"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg></button>
               <button class="btn-card-top" style="color:var(--red);" data-action="unload" data-tooltip="Unload Bot"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg></button>`
          }
          <button class="btn-card-top" data-action="edit" data-tooltip="Edit Credentials"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 113 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        </div>
      </div>
      <div class="bot-meta">
        <div class="bot-meta-item"><span class="bot-meta-label">Servers</span><span class="bot-meta-value" data-ref="servers">${serverCount}</span></div>
        <div class="bot-meta-item"><span class="bot-meta-label">Platform</span><span class="bot-meta-value"><span class="platform-badge" data-ref="platform">${esc(platform)}</span></span></div>
        <div class="bot-meta-item"><span class="bot-meta-label">Uptime</span><span class="bot-meta-value" data-ref="uptime">${uptime}</span></div>
        <div class="bot-meta-item"><span class="bot-meta-label">Presence</span><span class="bot-meta-value">
          <select class="select-presence" data-action="setpresence" ${bot.unloaded ? 'disabled' : ''}>
            <option value="online" ${bot.presenceStatus === 'online' ? 'selected' : ''}>Online</option>
            <option value="idle" ${bot.presenceStatus === 'idle' ? 'selected' : ''}>Idle</option>
            <option value="dnd" ${bot.presenceStatus === 'dnd' ? 'selected' : ''}>DND</option>
            <option value="streaming" ${bot.presenceStatus === 'streaming' ? 'selected' : ''}>Streaming</option>
            <option value="invisible" ${bot.presenceStatus === 'invisible' ? 'selected' : ''}>Invisible</option>
          </select>
        </span></div>
        <div class="bot-meta-item"><span class="bot-meta-label">ID</span><span class="bot-meta-value" style="font-family:var(--font-mono);font-size:0.72rem" data-ref="botId">${esc(bot.id || '—')}</span></div>
        <div class="bot-meta-item" style="grid-column: span 2"><span class="bot-meta-label">Created</span><span class="bot-meta-value" data-ref="createdAt">${formatCreatedDate(bot.createdAt)}</span></div>
      </div>
      <div data-ref="voiceBlock">${voiceHTML}</div>
      <div class="bot-actions ${bot.unloaded ? 'disabled' : ''}" style="${bot.unloaded ? 'opacity:0.4; pointer-events:none;' : ''}" data-ref="actions">
        <button class="btn-icon" data-tooltip="Join VC" data-action="joinvc"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 010 7.07"/><path d="M19.07 4.93a10 10 0 010 14.14"/></svg></button>
        <button class="btn-icon" data-tooltip="Leave VC" data-action="leave"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg></button>
        <button class="btn-icon ${isMuted ? 'active' : ''}" data-tooltip="${isMuted ? 'Unmute' : 'Mute'}" data-action="togglemute"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg></button>
        <button class="btn-icon ${isDeaf ? 'active' : ''}" data-tooltip="${isDeaf ? 'Undeafen' : 'Deafen'}" data-action="toggledeafen"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 18v-6a9 9 0 0118 0v6"/><path d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3z"/></svg></button>
        <button class="btn-icon" data-tooltip="Set Status" data-action="setstatus"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg></button>
        <button class="btn-icon" data-tooltip="Leave Server" data-action="leaveserver"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></button>
      </div>
      <div class="bot-status-input" data-ref="statusInput">
        <input type="text" class="input" placeholder="Custom status text…" data-ref="statusField" />
      </div>
      <div class="bot-note">
        <div class="bot-note-toggle" data-ref="noteToggle">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
          Notes
          <span class="bot-note-preview" data-ref="notePreview">${noteText ? esc(noteText) : ''}</span>
        </div>
        <div class="bot-note-editor" data-ref="noteEditor">
          <textarea data-ref="noteArea" placeholder="Add notes about this bot…">${esc(noteText)}</textarea>
          <div class="bot-note-saved" data-ref="noteSaved">Saved</div>
        </div>
      </div>
      <div class="bot-settings">
        <div class="bot-settings-toggle" data-ref="settingsToggle">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
          Settings
        </div>
        <div class="bot-settings-body" data-ref="settingsBody">
          <div class="setting-row">
            <span class="setting-label">Notify on move</span>
            <label class="toggle"><input type="checkbox" data-setting="notifyOnMove" ${notifyMove ? 'checked' : ''} /><span class="toggle-slider"></span></label>
          </div>
          <div class="setting-row">
            <span class="setting-label">Notify on disconnect</span>
            <label class="toggle"><input type="checkbox" data-setting="notifyOnDisconnect" ${notifyDC ? 'checked' : ''} /><span class="toggle-slider"></span></label>
          </div>
        </div>
      </div>`;
  }

  // ── In-place update — only mutate text/classes, don't replace the card ──
  function updateCardContent(card, bot) {
    const isOnline = bot.ready;
    card.classList.toggle('online', isOnline);
    card.classList.toggle('unloaded', !!bot.unloaded);

    const ref = (name) => card.querySelector(`[data-ref="${name}"]`);

    // Avatar
    const avatarEl = ref('avatar');
    if (avatarEl) {
      const initials = (bot.name || '?').slice(0, 2).toUpperCase();
      if (bot.avatarUrl) {
        const img = avatarEl.querySelector('img');
        if (img) {
          if (img.src !== bot.avatarUrl) img.src = bot.avatarUrl;
        } else {
          avatarEl.innerHTML = `<img src="${escapeAttr(bot.avatarUrl)}" alt="" onerror="this.parentElement.textContent='${initials}'">`;
        }
      } else {
        if (avatarEl.querySelector('img')) avatarEl.textContent = initials;
      }
    }

    // Status dot
    const dot = ref('statusDot');
    if (dot) dot.className = `bot-status-dot ${isOnline ? 'online' : ''}`;

    // Text fields
    setText(ref('botName'), bot.name || 'Unknown');
    setText(ref('botTag'), bot.tag || '—');
    setText(ref('servers'), bot.servers != null ? bot.servers.toLocaleString() : '—');
    setText(ref('platform'), bot.platform || bot.platformKey || '—');
    setText(ref('uptime'), formatUptime(bot.uptime));
    setText(ref('botId'), bot.id || '—');
    setText(ref('createdAt'), formatCreatedDate(bot.createdAt));

    // Top actions
    const actionsTop = card.querySelector('.bot-card-actions-top');
    if (actionsTop) {
      actionsTop.innerHTML = bot.unloaded
        ? `<button class="btn-card-top" data-action="reload" data-tooltip="Load Bot"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg></button>
           <button class="btn-card-top" data-action="edit" data-tooltip="Edit Credentials"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 113 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>`
        : `<button class="btn-card-top" data-action="reload" data-tooltip="Reload Bot"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg></button>
           <button class="btn-card-top" style="color:var(--red);" data-action="unload" data-tooltip="Unload Bot"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg></button>
           <button class="btn-card-top" data-action="edit" data-tooltip="Edit Credentials"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 113 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>`;
    }

    // Presence select
    const presenceSelect = card.querySelector('[data-action="setpresence"]');
    if (presenceSelect && document.activeElement !== presenceSelect) {
      presenceSelect.value = bot.presenceStatus || 'online';
      presenceSelect.disabled = !!bot.unloaded;
    }

    // Voice block
    const voiceBlock = ref('voiceBlock');
    if (voiceBlock) {
      if (bot.voice) {
        const ch = bot.voice.channel || 'Unknown';
        const gd = bot.voice.guild || '';
        voiceBlock.innerHTML = `
          <div class="bot-voice">
            <div class="bot-voice-label">Voice</div>
            <div class="bot-voice-value">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 010 7.07"/></svg>
              ${esc(ch)}${gd ? ` <span style="color:var(--text-muted)">· ${esc(gd)}</span>` : ''}
            </div>
            <div class="voice-indicators">
              <span class="voice-indicator ${bot.voice.muted ? 'active' : 'inactive'}">Muted</span>
              <span class="voice-indicator ${bot.voice.deafened ? 'active' : 'inactive'}">Deafened</span>
            </div>
          </div>`;
      } else {
        voiceBlock.innerHTML = `<div class="bot-voice"><div class="bot-voice-label">Voice</div><div class="bot-voice-value" style="color:var(--text-muted)">Not connected</div></div>`;
      }
    }

    // Action button states
    const muteBtn = card.querySelector('[data-action="togglemute"]');
    if (muteBtn) {
      const m = bot.voice?.muted;
      muteBtn.classList.toggle('active', !!m);
      muteBtn.dataset.tooltip = m ? 'Unmute' : 'Mute';
    }
    const deafBtn = card.querySelector('[data-action="toggledeafen"]');
    if (deafBtn) {
      const d = bot.voice?.deafened;
      deafBtn.classList.toggle('active', !!d);
      deafBtn.dataset.tooltip = d ? 'Undeafen' : 'Deafen';
    }

    // Actions block
    const actionsBlock = ref('actions');
    if (actionsBlock) {
      actionsBlock.className = `bot-actions ${bot.unloaded ? 'disabled' : ''}`;
      actionsBlock.style.opacity = bot.unloaded ? '0.4' : '';
      actionsBlock.style.pointerEvents = bot.unloaded ? 'none' : '';
    }

    // Settings toggles (don't overwrite if user is interacting)
    const moveCheck = card.querySelector('[data-setting="notifyOnMove"]');
    if (moveCheck && document.activeElement !== moveCheck) {
      moveCheck.checked = bot.settings?.notifyOnMove !== false;
    }
    const dcCheck = card.querySelector('[data-setting="notifyOnDisconnect"]');
    if (dcCheck && document.activeElement !== dcCheck) {
      dcCheck.checked = bot.settings?.notifyOnDisconnect !== false;
    }

    // Note area — only update if not focused
    const noteArea = ref('noteArea');
    if (noteArea && document.activeElement !== noteArea) {
      noteArea.value = bot.note || '';
    }
    const preview = ref('notePreview');
    if (preview) preview.textContent = bot.note || '';

    // Store latest data on card for action handlers
    card._botData = bot;
  }

  function setText(el, text) { if (el && el.textContent !== text) el.textContent = text; }

  // ── Attach event listeners to a NEW card ──
  function attachCardListeners(card, bot) {
    card._botData = bot;
    const idx = bot.index;

    // Inline input field helper
    const inp = card.querySelector('[data-ref="statusInput"]');
    const field = inp.querySelector('[data-ref="statusField"]');

    const openInlineInput = (placeholder, onEnter) => {
      if (inp.classList.contains('open') && field.placeholder === placeholder) {
        inp.classList.remove('open');
        return;
      }
      inp.classList.add('open');
      field.placeholder = placeholder;
      field.value = '';
      field.focus();
      field.onkeydown = (ev) => {
        if (ev.key === 'Enter') {
          const val = field.value.trim();
          if (val) onEnter(val);
          inp.classList.remove('open');
          field.value = '';
        }
      };
    };

    // Quick actions
    card.addEventListener('click', (e) => {
      const actionBtn = e.target.closest('[data-action]');
      if (!actionBtn) return;
      const action = actionBtn.dataset.action;
      const current = card._botData;

      switch (action) {
        case 'reload':
          socket.emit('reloadBot', { botIndex: idx });
          break;
        case 'unload':
          socket.emit('unloadBot', { botIndex: idx });
          break;
        case 'edit':
          openEditBotModal(current);
          break;
        case 'joinvc':
          openJoinVcModal(current);
          break;
        case 'leave':
          socket.emit('executeCommand', { botIndex: idx, command: 'leave vc' });
          break;
        case 'togglemute': {
          const cmd = current.voice?.muted ? 'unmute' : 'mute';
          socket.emit('executeCommand', { botIndex: idx, command: cmd });
          break;
        }
        case 'toggledeafen': {
          const cmd = current.voice?.deafened ? 'undeafen' : 'deafen';
          socket.emit('executeCommand', { botIndex: idx, command: cmd });
          break;
        }
        case 'setstatus':
          openInlineInput('Custom status text…', (val) => {
            socket.emit('executeCommand', { botIndex: idx, command: `set status ${val}` });
          });
          break;
        case 'leaveserver':
          openInlineInput('Server ID to leave…', (val) => {
            socket.emit('executeCommand', { botIndex: idx, command: `leave ${val}` });
          });
          break;
      }
      // Visual pulse
      actionBtn.style.transform = 'scale(0.85)';
      setTimeout(() => { actionBtn.style.transform = ''; }, 150);
    });

    // Presence selector
    const presenceSelect = card.querySelector('[data-action="setpresence"]');
    if (presenceSelect) {
      presenceSelect.addEventListener('change', () => {
        socket.emit('executeCommand', { botIndex: idx, command: `set presence ${presenceSelect.value}` });
      });
    }




    // Note toggle
    const noteToggle = card.querySelector('[data-ref="noteToggle"]');
    const noteEditor = card.querySelector('[data-ref="noteEditor"]');
    if (noteToggle && noteEditor) {
      noteToggle.addEventListener('click', () => {
        noteToggle.classList.toggle('open');
        noteEditor.classList.toggle('open');
      });
    }

    // Note save (debounced)
    const noteArea = card.querySelector('[data-ref="noteArea"]');
    const noteSaved = card.querySelector('[data-ref="noteSaved"]');
    if (noteArea) {
      noteArea.addEventListener('input', () => {
        clearTimeout(noteTimers[idx]);
        noteTimers[idx] = setTimeout(() => {
          socket.emit('updateBotNote', { botIndex: idx, note: noteArea.value });
          if (noteSaved) { noteSaved.classList.add('show'); setTimeout(() => noteSaved.classList.remove('show'), 1500); }
          const preview = card.querySelector('[data-ref="notePreview"]');
          if (preview) preview.textContent = noteArea.value;
        }, 800);
      });
    }

    // Settings toggle
    const settingsToggle = card.querySelector('[data-ref="settingsToggle"]');
    const settingsBody = card.querySelector('[data-ref="settingsBody"]');
    if (settingsToggle && settingsBody) {
      settingsToggle.addEventListener('click', () => {
        settingsToggle.classList.toggle('open');
        settingsBody.classList.toggle('open');
      });
    }

    // Setting checkboxes
    card.querySelectorAll('[data-setting]').forEach(cb => {
      cb.addEventListener('change', () => {
        socket.emit('updateBotSettings', { botIndex: idx, key: cb.dataset.setting, value: cb.checked });
      });
    });
  }

  // ── Selected bots logic ──
  function getSelectedBotIndices() {
    const checked = $$('#targetBotsWidget input[type="checkbox"]:checked');
    return Array.from(checked).map(cb => parseInt(cb.value, 10));
  }

  // ══════════════════════════════════════════
  //  JOIN VC MODAL
  // ══════════════════════════════════════════
  function openJoinVcModal(bot) {
    joinVcBotIndex = bot.index;
    dom.joinVcModal.classList.add('open');

    // Reset
    dom.vcServerSelect.innerHTML = '<option value="">Loading servers…</option>';
    dom.vcServerSelect.disabled = true;
    dom.vcChannelSelect.innerHTML = '<option value="">Select a server first</option>';
    dom.vcChannelSelect.disabled = true;
    dom.joinVcConfirmBtn.disabled = true;

    // Rejoin last
    if (bot.lastVc) {
      dom.joinVcRejoin.classList.remove('hidden');
      dom.joinVcRejoin.innerHTML = `
        <div class="rejoin-info">
          <div class="rejoin-label">Rejoin Last</div>
          <div class="rejoin-channel">${esc(bot.lastVc.channelName)}</div>
          <div class="rejoin-server">in ${esc(bot.lastVc.serverName)}</div>
        </div>
        <button class="btn-rejoin" id="rejoinBtn">Rejoin</button>`;
      const rejoinBtn = dom.joinVcRejoin.querySelector('#rejoinBtn');
      rejoinBtn.onclick = () => {
        socket.emit('executeCommand', {
          botIndex: bot.index,
          command: `join vc ${bot.lastVc.serverId} ${bot.lastVc.channelId}`
        });
        closeModal(dom.joinVcModal);
      };
    } else {
      dom.joinVcRejoin.classList.add('hidden');
    }

    // Request servers
    socket.emit('getBotServers', { botIndex: bot.index });
  }

  socket.on('botServers', (data) => {
    if (data.botIndex !== joinVcBotIndex) return;
    const servers = data.servers || [];
    dom.vcServerSelect.innerHTML = '<option value="">Select a server…</option>';
    servers.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = `${s.name}${s.memberCount ? ` (${s.memberCount} members)` : ''}`;
      dom.vcServerSelect.appendChild(opt);
    });
    dom.vcServerSelect.disabled = false;
  });

  dom.vcServerSelect.addEventListener('change', () => {
    const serverId = dom.vcServerSelect.value;
    if (!serverId || joinVcBotIndex == null) {
      dom.vcChannelSelect.innerHTML = '<option value="">Select a server first</option>';
      dom.vcChannelSelect.disabled = true;
      dom.joinVcConfirmBtn.disabled = true;
      return;
    }
    dom.vcChannelSelect.innerHTML = '<option value="">Loading channels…</option>';
    dom.vcChannelSelect.disabled = true;
    socket.emit('getBotChannels', { botIndex: joinVcBotIndex, serverId });
  });

  socket.on('botChannels', (data) => {
    if (data.botIndex !== joinVcBotIndex) return;
    // Support strings ('GUILD_VOICE') or numbers (2, 13)
    const channels = (data.channels || []).filter(c => 
      c.type === 2 || c.type === 13 || 
      c.type === 'GUILD_VOICE' || c.type === 'GUILD_STAGE_VOICE' ||
      c.type === 'voice' || c.type === 'stage'
    );
    dom.vcChannelSelect.innerHTML = '<option value="">Select a channel…</option>';
    channels.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = `🔊 ${c.name}${c.userCount != null ? ` (${c.userCount} users)` : ''}`;
      dom.vcChannelSelect.appendChild(opt);
    });
    dom.vcChannelSelect.disabled = false;
  });

  dom.vcChannelSelect.addEventListener('change', () => {
    dom.joinVcConfirmBtn.disabled = !dom.vcChannelSelect.value;
  });

  dom.joinVcConfirmBtn.addEventListener('click', () => {
    const serverId = dom.vcServerSelect.value;
    const channelId = dom.vcChannelSelect.value;
    if (!serverId || !channelId || joinVcBotIndex == null) return;
    socket.emit('executeCommand', {
      botIndex: joinVcBotIndex,
      command: `join vc ${serverId} ${channelId}`
    });
    closeModal(dom.joinVcModal);
  });

  dom.joinVcClose.addEventListener('click', () => closeModal(dom.joinVcModal));
  dom.joinVcCancelBtn.addEventListener('click', () => closeModal(dom.joinVcModal));

  // ══════════════════════════════════════════
  //  EDIT BOT MODAL
  // ══════════════════════════════════════════
  function openEditBotModal(bot) {
    dom.editBotIndex.value = bot.index;
    dom.editBotName.value = bot.name || '';
    dom.editBotToken.value = ''; // Empty to keep token masked
    dom.editBotPlatform.value = bot.platformKey || 'desktop';
    dom.editBotReload.checked = true;
    dom.editBotModal.classList.add('open');
  }

  dom.editBotSubmitBtn.addEventListener('click', () => {
    const botIndex = parseInt(dom.editBotIndex.value, 10);
    const name = dom.editBotName.value.trim();
    const token = dom.editBotToken.value.trim();
    const platform = dom.editBotPlatform.value;
    const reload = dom.editBotReload.checked;

    if (isNaN(botIndex)) return;

    socket.emit('editBot', {
      botIndex,
      name: name || undefined,
      token: token || undefined,
      platform,
      reload
    });
    closeModal(dom.editBotModal);
  });

  dom.editBotClose.addEventListener('click', () => closeModal(dom.editBotModal));
  dom.editBotCancelBtn.addEventListener('click', () => closeModal(dom.editBotModal));

  // ══════════════════════════════════════════
  //  ADD BOT MODAL
  // ══════════════════════════════════════════
  dom.addBotCard.addEventListener('click', () => {
    dom.addBotModal.classList.add('open');
    dom.addBotName.value = '';
    dom.addBotToken.value = '';
    dom.addBotPlatform.value = 'desktop';
  });

  dom.addBotSubmitBtn.addEventListener('click', () => {
    const name = dom.addBotName.value.trim();
    const token = dom.addBotToken.value.trim();
    const platform = dom.addBotPlatform.value;
    if (!name || !token) return;
    socket.emit('addBot', { name, token, platform });
    closeModal(dom.addBotModal);
  });

  dom.addBotClose.addEventListener('click', () => closeModal(dom.addBotModal));
  dom.addBotCancelBtn.addEventListener('click', () => closeModal(dom.addBotModal));

  // ── Close modal helper ──
  function closeModal(overlay) {
    overlay.classList.remove('open');
    joinVcBotIndex = null;
  }

  // Click outside to close
  [dom.joinVcModal, dom.addBotModal, dom.editBotModal].forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal(overlay);
    });
  });

  // ══════════════════════════════════════════
  //  COMMAND EXECUTION
  // ══════════════════════════════════════════
  function sendCommand() {
    const botIndices = getSelectedBotIndices();
    const command = dom.commandInput.value.trim();
    if (botIndices.length === 0) { flashResult('Select at least one bot first', false); return; }
    if (!command)                 { flashResult('Enter a command', false); return; }
    
    socket.emit('massCommand', { botIndices, command });
    dom.commandInput.value = '';
  }

  socket.on('commandResult', (data) => {
    flashResult(
      `[${data.bot ?? '?'}] ${data.result || (data.success ? 'OK' : 'Failed')}`,
      data.success
    );
    if (dom.settingNotifyCommand && dom.settingNotifyCommand.checked) {
      const type = data.success ? 'success' : 'warning';
      showToast(type, data.command || 'Command Result', `[${data.bot ?? '?'}] ${data.result || (data.success ? 'OK' : 'Failed')}`);
    }
  });

  function flashResult(text, success) {
    dom.commandResult.textContent = text;
    dom.commandResult.className = 'command-result ' + (success ? 'success' : 'error');
  }

  dom.sendCommandBtn.addEventListener('click', sendCommand);
  dom.commandInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendCommand(); });

  dom.massUnloadBtn.addEventListener('click', () => {
    const botIndices = getSelectedBotIndices();
    if (botIndices.length === 0) { flashResult('Select at least one bot to unload', false); return; }
    socket.emit('massUnload', { botIndices });
  });

  dom.massLoadBtn.addEventListener('click', () => {
    const botIndices = getSelectedBotIndices();
    if (botIndices.length === 0) { flashResult('Select at least one bot to load', false); return; }
    socket.emit('massLoad', { botIndices });
  });

  dom.massDmBtn.addEventListener('click', () => {
    const botIndices = getSelectedBotIndices();
    const userId = dom.massDmUserId.value.trim();
    const message = dom.massDmMessage.value.trim();
    const deleteAfter = dom.massDmDeleteCheck.checked;
    const delay = dom.massDmDelayInput.value.trim() || '2-5';
    if (botIndices.length === 0) { flashResult('Select at least one bot for Mass DM', false); return; }
    if (!userId || !message) { flashResult('User ID and message content are required', false); return; }
    socket.emit('massDm', { botIndices, userId, message, deleteAfter, delay });
    dom.massDmMessage.value = '';
  });

  // ── Tabs Switching ──
  $$('.menu-link').forEach(link => {
    link.addEventListener('click', () => {
      const targetTab = link.dataset.tab;
      $$('.menu-link').forEach(l => l.classList.remove('active'));
      $$('.tab-pane').forEach(p => p.classList.add('hidden'));

      link.classList.add('active');
      const pane = document.getElementById(targetTab);
      if (pane) pane.classList.remove('hidden');

      // Update breadcrumbs
      const parentName = link.getAttribute('data-parent') || 'Overview';
      const childName = link.getAttribute('data-child') || 'Dashboard';
      if (dom.breadParent) dom.breadParent.textContent = parentName;
      if (dom.breadChild) dom.breadChild.textContent = childName;
    });
  });

  // ── Sidebar Collapse Toggle ──
  const sidebar = document.getElementById('sidebar');
  const sidebarToggle = document.getElementById('sidebarToggle');
  if (sidebar && sidebarToggle) {
    sidebarToggle.addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
      localStorage.setItem('sidebar_collapsed', sidebar.classList.contains('collapsed'));
    });
    if (localStorage.getItem('sidebar_collapsed') === 'true') {
      sidebar.classList.add('collapsed');
    }
  }

  // ── Mass Settings Tab Event Listeners ──
  dom.applyMassSettingsBtn.addEventListener('click', () => {
    const botIndices = getSelectedBotIndices();
    if (botIndices.length === 0) {
      flashResult('❌ Select target bots first', false);
      return;
    }
    const notifyOnMove = dom.massNotifyOnMove.checked;
    const notifyOnDisconnect = dom.massNotifyOnDisconnect.checked;
    socket.emit('massUpdateSettings', {
      botIndices,
      settings: { notifyOnMove, notifyOnDisconnect }
    });
  });

  dom.applyMassPlatformBtn.addEventListener('click', () => {
    const botIndices = getSelectedBotIndices();
    if (botIndices.length === 0) {
      flashResult('❌ Select target bots first', false);
      return;
    }
    const platform = dom.massPlatformSelect.value;
    socket.emit('massUpdatePlatform', { botIndices, platform });
  });

  dom.applyMassPresenceBtn.addEventListener('click', () => {
    const botIndices = getSelectedBotIndices();
    if (botIndices.length === 0) {
      flashResult('❌ Select target bots first', false);
      return;
    }
    const presence = dom.massPresenceSelect.value;
    socket.emit('massUpdatePresence', { botIndices, presence });
  });

  // ══════════════════════════════════════════
  //  CONSOLE LOG
  // ══════════════════════════════════════════
  socket.on('consoleLog', (entry) => appendConsoleEntry(entry));
  socket.on('consoleLogs', (entries) => {
    if (Array.isArray(entries)) entries.forEach(e => appendConsoleEntry(e));
  });

  function appendConsoleEntry(entry) {
    const el = document.createElement('div');
    const level = (entry.level || 'info').toLowerCase();
    el.className = `console-entry ${level}`;
    const time = entry.time ? formatConsoleTime(entry.time) : '—';
    el.innerHTML = `
      <span class="console-time">${esc(time)}</span>
      <span class="console-level ${level}">${esc(level)}</span>
      <span class="console-bot">${esc(entry.bot || '—')}</span>
      <span class="console-msg">${esc(entry.msg || '')}</span>`;
    dom.consoleEntries.appendChild(el);
    while (dom.consoleEntries.children.length > MAX_CONSOLE) dom.consoleEntries.removeChild(dom.consoleEntries.firstChild);
    const viewer = dom.consoleEntries.parentElement;
    if (viewer.scrollHeight - viewer.scrollTop - viewer.clientHeight < 80) viewer.scrollTop = viewer.scrollHeight;

    if (dom.settingNotifyConsole && dom.settingNotifyConsole.checked) {
      if (level === 'warn' || level === 'error') {
        const type = level === 'error' ? 'warning' : 'info';
        showToast(type, `Bot Console ${entry.level || 'Log'}`, `[${entry.bot || '—'}] ${entry.msg || ''}`);
      }
    }
  }

  dom.closeConsole = () => {}; // NOOP
  dom.clearConsoleBtn.addEventListener('click', () => { dom.consoleEntries.innerHTML = ''; });

  // ══════════════════════════════════════════
  //  TRUSTED USERS
  // ══════════════════════════════════════════
  socket.on('trustedUsers', (users) => renderTrustedUsers(users));

  // ══════════════════════════════════════════
  //  UTILITIES
  // ══════════════════════════════════════════
  const _escDiv = document.createElement('div');
  function esc(str) { _escDiv.textContent = String(str ?? ''); return _escDiv.innerHTML; }
  function escapeAttr(str) { return String(str ?? '').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

  function formatUptime(val) {
    return String(val || '—');
  }

  function formatCreatedDate(isoStr) {
    if (!isoStr) return '—';
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch { return '—'; }
  }

  function formatConsoleTime(time) {
    try {
      const d = new Date(time);
      if (isNaN(d.getTime())) return String(time);
      return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch { return String(time); }
  }

  function renderTrustedUsers(users) {
    dom.trustedList.innerHTML = '';
    if (!users || users.length === 0) {
      const li = document.createElement('li');
      li.className = 'empty-state-sm';
      li.textContent = 'No trusted users';
      dom.trustedList.appendChild(li);
      return;
    }
    users.forEach(user => {
      const li = document.createElement('li');
      li.className = 'trusted-item';
      li.innerHTML = `
        <div class="trusted-info">
          <span class="trusted-tag">${esc(user.tag || 'Unknown')}</span>
          <span class="trusted-id">${esc(user.id)}</span>
        </div>
        <button class="btn btn-danger btn-sm remove-user-btn" data-uid="${escapeAttr(user.id)}">Remove</button>`;
      dom.trustedList.appendChild(li);
    });
    dom.trustedList.querySelectorAll('.remove-user-btn').forEach(btn => {
      btn.addEventListener('click', () => socket.emit('removeUser', { userId: btn.dataset.uid }));
    });
  }

  function addUser() {
    const userId = dom.addUserInput.value.trim();
    if (!userId) return;
    socket.emit('addUser', { userId });
    dom.addUserInput.value = '';
  }
  dom.addUserBtn.addEventListener('click', addUser);
  dom.addUserInput.addEventListener('keydown', e => { if (e.key === 'Enter') addUser(); });

  if (dom.filterServerId) {
    dom.filterServerId.addEventListener('input', () => {
      updateBotGrid(botStatuses);
      updateTargetBotsWidget(botStatuses);
    });
  }
  if (dom.filterStatus) {
    dom.filterStatus.addEventListener('change', () => {
      updateBotGrid(botStatuses);
      updateTargetBotsWidget(botStatuses);
    });
  }
  if (dom.showHiddenBots) {
    dom.showHiddenBots.addEventListener('change', () => {
      updateTargetBotsWidget(botStatuses);
    });
  }

  // ── Toast Notification System ──
  function showToast(type, title, body, duration = 5000) {
    const enabled = dom.settingNotifyEnabled ? dom.settingNotifyEnabled.checked : true;
    if (!enabled) return;

    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast-notification ${type}`;
    
    const prefixMap = {
      success: 'Success',
      warning: 'Warning',
      caution: 'Caution',
      info: 'Info',
      loading: 'Loading'
    };
    const prefix = prefixMap[type] || 'Info';
    const message = body ? `${title}. ${body}` : title;

    toast.innerHTML = `<strong>${prefix}:</strong> ${esc(message)}`;

    toast.addEventListener('click', () => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 300);
    });

    container.appendChild(toast);

    if (duration > 0) {
      setTimeout(() => {
        if (toast.parentElement) {
          toast.classList.add('fade-out');
          setTimeout(() => toast.remove(), 300);
        }
      }, duration);
    }
  }

  // Load App Settings from LocalStorage
  function loadAppSettings() {
    const defaultSettings = {
      settingNotifyEnabled: true,
      settingNotifyConnection: true,
      settingNotifyVc: true,
      settingNotifyCommand: true,
      settingNotifyConsole: true
    };
    
    for (const key in defaultSettings) {
      const val = localStorage.getItem(key);
      const input = document.getElementById(key);
      if (input) {
        input.checked = val !== null ? val === 'true' : defaultSettings[key];
        input.addEventListener('change', () => {
          localStorage.setItem(key, input.checked);
        });
      }
    }
  }

  // ══════════════════════════════════════════
  //  INIT
  // ══════════════════════════════════════════
  loadAppSettings();
  socket.connect();
  const storedPw = sessionStorage.getItem('cp_auth');
  if (storedPw) dom.passwordInput.value = storedPw;

})();
