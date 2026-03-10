import { supabase } from './lib/supabase';

// Beautiful HTML Friends & Online Duel panel
export class FriendsPanel {
  constructor({ user, profile, onStartDuel, onClose }) {
    this.user = user;
    this.profile = profile;
    this.onStartDuel = onStartDuel;
    this.onClose = onClose;

    this.friends = [];       // accepted friends
    this.pending = [];       // incoming pending
    this.invites = [];       // game invites to me
    this.searchResults = [];
    this.searchQuery = '';
    this.activeTab = 'friends'; // friends | search | duel
    this.myGame = null;         // if I'm hosting a duel
    this.loading = false;

    this._channels = [];
    this._presenceOnline = {}; // { userId: true }
    this._el = null;
    this._build();
    this._load();
    this._subscribeRealtime();
    this._subscribePresence();
  }

  // ── Build DOM ─────────────────────────────────────────────────────────────
  _build() {
    const el = document.createElement('div');
    el.id = 'friends-panel';
    Object.assign(el.style, {
      position: 'fixed', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
      zIndex: 100, fontFamily: 'Inter, system-ui, sans-serif',
    });

    el.innerHTML = `
      <div id="fp-card" style="
        width: min(520px, 96vw); max-height: 90vh;
        background: linear-gradient(160deg, #1e293b 0%, #0f172a 100%);
        border: 1px solid #334155; border-radius: 24px;
        display: flex; flex-direction: column; overflow: hidden;
        box-shadow: 0 30px 80px rgba(0,0,0,0.6);
      ">
        <!-- Header -->
        <div style="
          display: flex; align-items: center; justify-content: space-between;
          padding: 20px 24px 0; flex-shrink: 0;
        ">
          <div style="font-size: 22px; font-weight: 900; color: #f8fafc;">
            ⚔️  Online Duel
          </div>
          <button id="fp-close" style="
            background: none; border: 1px solid #334155; color: #94a3b8;
            width: 36px; height: 36px; border-radius: 10px; cursor: pointer;
            font-size: 16px; display: flex; align-items: center; justify-content: center;
            transition: all 0.2s;
          ">✕</button>
        </div>

        <!-- Tabs -->
        <div id="fp-tabs" style="
          display: flex; gap: 8px; padding: 16px 24px 0; flex-shrink: 0;
        ">
          ${this._tabBtn('friends', '👥 Priatelia')}
          ${this._tabBtn('search', '🔍 Hľadať')}
          ${this._tabBtn('duel', '⚡ Duel Lobby')}
        </div>

        <!-- Body -->
        <div id="fp-body" style="flex: 1; overflow-y: auto; padding: 16px 24px 24px;">
          <div id="fp-content">Načítavam...</div>
        </div>

        <!-- Invite notification bar (hidden by default) -->
        <div id="fp-invite-bar" style="
          display: none; flex-shrink: 0;
          background: linear-gradient(90deg, #4f46e5, #7c3aed);
          padding: 12px 24px; gap: 12px; align-items: center;
        ">
          <span id="fp-invite-text" style="flex:1; color:#fff; font-size:14px; font-weight:600;"></span>
          <button id="fp-invite-accept" style="
            background:#10b981; border:none; color:#fff; font-weight:700;
            padding: 8px 18px; border-radius:10px; cursor:pointer; font-size:13px;
          ">Prijať</button>
          <button id="fp-invite-decline" style="
            background:rgba(255,255,255,0.15); border:none; color:#fff;
            padding: 8px 18px; border-radius:10px; cursor:pointer; font-size:13px;
          ">Odmietnuť</button>
        </div>
      </div>
    `;

    document.body.appendChild(el);
    this._el = el;

    // Bind tabs
    el.querySelectorAll('.fp-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.activeTab = tab.dataset.tab;
        this._renderContent();
        this._updateTabs();
      });
    });

    el.querySelector('#fp-close').addEventListener('click', () => this.destroy());
    this._updateTabs();
    this._renderContent();
  }

  _tabBtn(id, label) {
    return `<button class="fp-tab" data-tab="${id}" style="
      flex: 1; padding: 10px; border-radius: 12px; border: 1px solid #334155;
      background: transparent; color: #94a3b8; font-size: 14px; font-weight: 600;
      cursor: pointer; transition: all 0.2s; font-family: Inter, system-ui, sans-serif;
    ">${label}</button>`;
  }

  _updateTabs() {
    this._el.querySelectorAll('.fp-tab').forEach(tab => {
      const active = tab.dataset.tab === this.activeTab;
      Object.assign(tab.style, {
        background: active ? 'rgba(59,130,246,0.2)' : 'transparent',
        borderColor: active ? '#3b82f6' : '#334155',
        color: active ? '#60a5fa' : '#94a3b8',
      });
    });
  }

  // ── Data ──────────────────────────────────────────────────────────────────
  async _load() {
    this.loading = true;
    this._renderContent();

    // Load friends
    const { data: fr } = await supabase
      .from('friends')
      .select('*, user: profiles!friends_user_id_fkey(id, username, online_status), friend: profiles!friends_friend_id_fkey(id, username, online_status)')
      .or(`user_id.eq.${this.user.id},friend_id.eq.${this.user.id}`);

    if (fr) {
      this.friends = fr.filter(f => f.status === 'accepted').map(f =>
        f.user_id === this.user.id ? f.friend : f.user
      );
      this.pending = fr.filter(f => f.status === 'pending' && f.friend_id === this.user.id);
    }

    // Load incoming game invites
    await this._loadInvites();

    this.loading = false;
    this._renderContent();
  }

  async _loadInvites() {
    const { data } = await supabase
      .from('hl_game_invites')
      .select('*, from_profile: profiles!hl_game_invites_from_user_id_fkey(username)')
      .eq('to_user_id', this.user.id)
      .eq('status', 'pending');
    this.invites = data || [];
    this._renderInviteBar();
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  _renderContent() {
    const body = this._el.querySelector('#fp-content');
    if (this.loading) { body.innerHTML = this._spinner(); return; }

    if (this.activeTab === 'friends') body.innerHTML = this._renderFriends();
    else if (this.activeTab === 'search') body.innerHTML = this._renderSearch();
    else if (this.activeTab === 'duel') body.innerHTML = this._renderDuel();

    this._bindContent();
  }

  _renderFriends() {
    const pendingHTML = this.pending.length ? `
      <div style="margin-bottom:16px;">
        <div style="font-size:12px; font-weight:600; color:#f59e0b; text-transform:uppercase; letter-spacing:1px; margin-bottom:8px;">
          📬 Žiadosti o priateľstvo (${this.pending.length})
        </div>
        ${this.pending.map(f => `
          <div class="friend-row" style="
            display:flex; align-items:center; gap:12px;
            background:rgba(245,158,11,0.08); border:1px solid rgba(245,158,11,0.25);
            border-radius:14px; padding:12px 16px; margin-bottom:8px;
          ">
            ${this._avatar(f.user?.username || '?', '#f59e0b')}
            <span style="flex:1; color:#f8fafc; font-weight:600; font-size:15px;">${f.user?.username || 'Neznámy'}</span>
            <button class="fp-accept-friend" data-id="${f.id}" style="
              background:#10b981; border:none; color:#fff; font-weight:700;
              padding:7px 16px; border-radius:10px; cursor:pointer; font-size:13px; margin-right:6px;
            ">✓</button>
            <button class="fp-decline-friend" data-id="${f.id}" style="
              background:rgba(239,68,68,0.2); border:1px solid #ef4444; color:#ef4444;
              padding:7px 16px; border-radius:10px; cursor:pointer; font-size:13px;
            ">✕</button>
          </div>
        `).join('')}
      </div>` : '';

    const friendsHTML = this.friends.length ? this.friends.map(f => `
      <div class="friend-row" style="
        display:flex; align-items:center; gap:12px;
        background:rgba(255,255,255,0.03); border:1px solid #1e293b;
        border-radius:14px; padding:12px 16px; margin-bottom:8px;
        transition: background 0.2s;
      " onmouseover="this.style.background='rgba(59,130,246,0.06)'" onmouseout="this.style.background='rgba(255,255,255,0.03)'">
        ${this._avatar(f.username, this._presenceOnline[f.id] ? '#10b981' : '#475569')}
        <div style="flex:1;">
          <div style="color:#f8fafc; font-weight:600; font-size:15px;">${f.username}</div>
          <div style="font-size:12px; color:${this._presenceOnline[f.id] ? '#10b981' : '#475569'};">
            ${this._presenceOnline[f.id] ? '🟢 Online' : '⚫ Offline'}
          </div>
        </div>
        <button class="fp-invite-friend" data-uid="${f.id}" data-name="${f.username}" style="
          background:rgba(139,92,246,0.2); border:1px solid #8b5cf6; color:#a78bfa;
          padding:7px 16px; border-radius:10px; cursor:pointer; font-size:13px; font-weight:600;
        ">⚔️ Pozvať</button>
      </div>
    `).join('') : `<div style="color:#475569; text-align:center; padding:32px 0; font-size:15px;">
      Zatiaľ nemáš žiadnych priateľov.<br>
      <span style="color:#3b82f6; cursor:pointer;" onclick="document.querySelector('[data-tab=search]').click()">
        Vyhľadaj hráčov →
      </span>
    </div>`;

    return `
      <div style="font-size:12px; font-weight:600; color:#94a3b8; text-transform:uppercase; letter-spacing:1px; margin-bottom:12px;">
        👥 Priatelia (${this.friends.length})
      </div>
      ${pendingHTML}
      ${friendsHTML}
    `;
  }

  _renderSearch() {
    const resultsHTML = this.searchResults.map(u => {
      const isSelf = u.id === this.user.id;
      const isFriend = this.friends.some(f => f.id === u.id);
      const isPending = this.pending.some(f => f.user_id === u.id);
      return `
        <div style="
          display:flex; align-items:center; gap:12px;
          background:rgba(255,255,255,0.03); border:1px solid #1e293b;
          border-radius:14px; padding:12px 16px; margin-bottom:8px;
        ">
          ${this._avatar(u.username, '#3b82f6')}
          <div style="flex:1;">
            <div style="color:#f8fafc; font-weight:600; font-size:15px;">${u.username}</div>
          </div>
          ${isSelf ? `<span style="color:#475569; font-size:13px;">Ty</span>`
            : isFriend ? `<span style="color:#10b981; font-size:13px;">✓ Priateľ</span>`
            : isPending ? `<span style="color:#f59e0b; font-size:13px;">⏳ Čaká</span>`
            : `<button class="fp-add-friend" data-uid="${u.id}" data-name="${u.username}" style="
              background:rgba(59,130,246,0.2); border:1px solid #3b82f6; color:#60a5fa;
              padding:7px 16px; border-radius:10px; cursor:pointer; font-size:13px; font-weight:600;
            ">+ Pridať</button>`
          }
        </div>`;
    }).join('');

    return `
      <div style="margin-bottom:16px;">
        <input id="fp-search-input" type="text" placeholder="Hľadaj podľa prezývky..." value="${this.searchQuery}"
          style="
            width:100%; box-sizing:border-box; padding:12px 16px;
            background:rgba(15,23,42,0.8); border:2px solid #334155;
            border-radius:14px; color:#f8fafc; font-size:15px;
            font-family:Inter,system-ui,sans-serif; outline:none; transition:border-color 0.2s;
          "
        />
      </div>
      <div id="fp-search-results">${resultsHTML || (this.searchQuery ? '<div style="color:#475569;text-align:center;padding:24px;">Žiadne výsledky</div>' : '')}</div>
    `;
  }

  _renderDuel() {
    if (this.myGame) {
      return `
        <div style="text-align:center; padding: 16px 0;">
          <div style="font-size:32px; margin-bottom:12px;">⚔️</div>
          <div style="color:#f8fafc; font-size:20px; font-weight:900; margin-bottom:8px;">Duel čaká na súpera</div>
          <div style="color:#94a3b8; font-size:14px; margin-bottom:24px;">Pošli pozvánku priateľovi alebo zdieľaj kód</div>
          <div style="
            background:rgba(59,130,246,0.15); border:2px dashed #3b82f6;
            border-radius:16px; padding:16px 24px; margin-bottom:24px;
            font-size:32px; font-weight:900; color:#60a5fa; letter-spacing:6px;
          ">${this.myGame.join_code}</div>
          <div style="color:#94a3b8; font-size:13px; margin-bottom:20px;">
            Alebo pozvi priateľa zo záložky Priatelia
          </div>
          <button id="fp-cancel-duel" style="
            background:rgba(239,68,68,0.15); border:1px solid #ef4444; color:#ef4444;
            padding:10px 24px; border-radius:12px; cursor:pointer; font-size:14px; font-weight:600;
          ">Zrušiť Duel</button>
        </div>
      `;
    }

    return `
      <div style="text-align:center; padding: 24px 0;">
        <div style="font-size:48px; margin-bottom:16px;">⚔️</div>
        <div style="color:#f8fafc; font-size:18px; font-weight:700; margin-bottom:8px;">Multiplayer Duel</div>
        <div style="color:#94a3b8; font-size:14px; margin-bottom:32px; line-height:1.6;">
          Zahraj si Higher or Lower proti priateľovi!<br>
          Kto nazbiera viac bodov, vyhrá.
        </div>
        <button id="fp-create-duel" style="
          background: linear-gradient(135deg, #8b5cf6, #6d28d9);
          border:none; color:#fff; font-weight:900; font-size:18px;
          padding:16px 40px; border-radius:16px; cursor:pointer;
          box-shadow: 0 8px 24px rgba(109,40,217,0.4);
          font-family:Inter,system-ui,sans-serif; transition:transform 0.2s;
          width: 100%;
        ">⚡  Vytvoriť Duel Lobby</button>
        <div style="margin:20px 0; color:#334155; font-size:13px;">— alebo —</div>
        <input id="fp-join-code" type="text" placeholder="Zadaj kód pozvánky..." maxlength="6" style="
          width:100%; box-sizing:border-box; padding:12px 16px;
          background:rgba(15,23,42,0.8); border:2px solid #334155;
          border-radius:14px; color:#f8fafc; font-size:18px;
          font-family:Inter,system-ui,sans-serif; outline:none;
          text-align:center; letter-spacing:4px; text-transform:uppercase;
          margin-bottom:12px;
        "/>
        <button id="fp-join-duel" style="
          background:rgba(59,130,246,0.2); border:2px solid #3b82f6; color:#60a5fa;
          font-weight:700; font-size:16px; padding:12px 32px; border-radius:14px;
          cursor:pointer; font-family:Inter,system-ui,sans-serif; width:100%;
        ">Pripojiť sa ku Duelu</button>
      </div>
    `;
  }

  _avatar(name, color) {
    const letter = (name || '?')[0].toUpperCase();
    return `<div style="
      width:40px; height:40px; border-radius:50%; flex-shrink:0;
      background:${color}22; border:2px solid ${color};
      display:flex; align-items:center; justify-content:center;
      font-weight:900; font-size:16px; color:${color};
    ">${letter}</div>`;
  }

  _spinner() {
    return `<div style="text-align:center; padding:40px; color:#475569;">Načítavam...</div>`;
  }

  // ── Bind Events ───────────────────────────────────────────────────────────
  _bindContent() {
    // Search
    const si = this._el.querySelector('#fp-search-input');
    if (si) {
      si.addEventListener('focus', () => si.style.borderColor = '#3b82f6');
      si.addEventListener('blur', () => si.style.borderColor = '#334155');
      si.addEventListener('input', (e) => {
        this.searchQuery = e.target.value;
        clearTimeout(this._searchT);
        this._searchT = setTimeout(() => this._search(), 350);
      });
      si.focus();
    }

    // Add friend buttons
    this._el.querySelectorAll('.fp-add-friend').forEach(btn => {
      btn.addEventListener('click', async () => {
        const uid = btn.dataset.uid;
        btn.textContent = '⏳'; btn.disabled = true;
        await this._sendFriendRequest(uid);
        await this._load();
      });
    });

    // Accept/Decline friend
    this._el.querySelectorAll('.fp-accept-friend').forEach(btn => {
      btn.addEventListener('click', async () => {
        await supabase.from('friends').update({ status: 'accepted' }).eq('id', btn.dataset.id);
        await this._load();
      });
    });
    this._el.querySelectorAll('.fp-decline-friend').forEach(btn => {
      btn.addEventListener('click', async () => {
        await supabase.from('friends').delete().eq('id', btn.dataset.id);
        await this._load();
      });
    });

    // Invite friend to duel
    this._el.querySelectorAll('.fp-invite-friend').forEach(btn => {
      btn.addEventListener('click', async () => {
        this.activeTab = 'duel';
        this._updateTabs();
        if (!this.myGame) await this._createDuel();
        // Now send invite
        await this._sendGameInvite(btn.dataset.uid, btn.dataset.name);
        this._renderContent();
      });
    });

    // Create duel
    const cd = this._el.querySelector('#fp-create-duel');
    if (cd) cd.addEventListener('click', async () => {
      cd.textContent = 'Vytváram...'; cd.disabled = true;
      await this._createDuel();
      this._renderContent();
    });

    // Cancel duel
    const cancel = this._el.querySelector('#fp-cancel-duel');
    if (cancel) cancel.addEventListener('click', async () => {
      if (this.myGame) {
        await supabase.from('higher_lower_games').update({ status: 'cancelled' }).eq('id', this.myGame.id);
        this.myGame = null;
        this._renderContent();
      }
    });

    // Join by code
    const jd = this._el.querySelector('#fp-join-duel');
    if (jd) jd.addEventListener('click', async () => {
      const code = this._el.querySelector('#fp-join-code')?.value?.trim().toUpperCase();
      if (!code || code.length < 4) return;
      await this._joinDuel(code);
    });
  }

  // ── Friend Actions ────────────────────────────────────────────────────────
  async _search() {
    if (!this.searchQuery.trim()) { this.searchResults = []; this._renderContent(); return; }
    const { data } = await supabase.from('profiles')
      .select('id, username, online_status')
      .ilike('username', `%${this.searchQuery}%`)
      .limit(10);
    this.searchResults = data || [];
    this._renderContent();
  }

  async _sendFriendRequest(friendId) {
    await supabase.from('friends').insert({ user_id: this.user.id, friend_id: friendId, status: 'pending' });
  }

  // ── Duel Actions ──────────────────────────────────────────────────────────
  async _createDuel() {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const { data } = await supabase.from('higher_lower_games').insert({
      host_id: this.user.id,
      join_code: code,
      status: 'waiting',
      is_public: false,
    }).select().single();
    this.myGame = data;

    // Subscribe to this game – when someone joins and sets status='playing', start the duel
    if (data) {
      this._gameSub = supabase.channel(`duel-host-${data.id}`)
        .on('postgres_changes', {
          event: 'UPDATE', schema: 'public', table: 'higher_lower_games',
          filter: `id=eq.${data.id}`,
        }, (payload) => {
          if (payload.new.status === 'playing') {
            // Opponent joined! Start the duel as host
            if (this._gameSub) { this._gameSub.unsubscribe(); this._gameSub = null; }
            this.destroy();
            this.onStartDuel(payload.new, true);
          }
        })
        .subscribe();
    }

    return data;
  }

  async _sendGameInvite(toUserId, toName) {
    if (!this.myGame) return;
    await supabase.from('hl_game_invites').insert({
      game_id: this.myGame.id,
      from_user_id: this.user.id,
      to_user_id: toUserId,
    });
    // Visual confirmation
    const bar = this._el.querySelector('#fp-invite-bar') || this._el.querySelector('#fp-content');
    if (bar) {
      const conf = document.createElement('div');
      Object.assign(conf.style, {
        position: 'fixed', top: '24px', left: '50%', transform: 'translateX(-50%)',
        background: '#10b981', color: '#fff', padding: '12px 28px',
        borderRadius: '14px', fontSize: '15px', fontWeight: '700',
        zIndex: 200, boxShadow: '0 8px 24px rgba(16,185,129,0.4)',
      });
      conf.textContent = `✓ Pozvánka odoslaná hráčovi ${toName}!`;
      document.body.appendChild(conf);
      setTimeout(() => conf.remove(), 3000);
    }
  }

  async _joinDuel(code) {
    const { data: game, error } = await supabase.from('higher_lower_games')
      .select('*').eq('join_code', code).eq('status', 'waiting').single();
    if (error || !game) {
      alert('Kód nenájdený alebo hra už prebehla.');
      return;
    }
    // Update game status to playing so host gets notified
    await supabase.from('higher_lower_games').update({ status: 'playing' }).eq('id', game.id);
    const updated = { ...game, status: 'playing' };
    this.destroy();
    this.onStartDuel(updated, false);
  }

  async _acceptInvite(invite) {
    await supabase.from('hl_game_invites').update({ status: 'accepted' }).eq('id', invite.id);
    const { data: game } = await supabase.from('higher_lower_games').select('*').eq('id', invite.game_id).single();
    if (game) {
      // Set game to playing so host is notified
      await supabase.from('higher_lower_games').update({ status: 'playing' }).eq('id', game.id);
      const updated = { ...game, status: 'playing' };
      this.destroy();
      this.onStartDuel(updated, false);
    }
  }

  async _declineInvite(invite) {
    await supabase.from('hl_game_invites').update({ status: 'declined' }).eq('id', invite.id);
    this.invites = this.invites.filter(i => i.id !== invite.id);
    this._renderInviteBar();
  }

  _renderInviteBar() {
    const bar = this._el.querySelector('#fp-invite-bar');
    if (!bar) return;
    if (this.invites.length === 0) { bar.style.display = 'none'; return; }
    const inv = this.invites[0];
    const fromName = inv.from_profile?.username || 'Hráč';
    bar.style.display = 'flex';
    this._el.querySelector('#fp-invite-text').textContent = `${fromName} ťa pozýva na Higher or Lower Duel!`;
    this._el.querySelector('#fp-invite-accept').onclick = () => this._acceptInvite(inv);
    this._el.querySelector('#fp-invite-decline').onclick = () => this._declineInvite(inv);
  }

  // ── Realtime ──────────────────────────────────────────────────────────────
  _subscribeRealtime() {
    const ch = supabase.channel(`friends-panel-${this.user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'hl_game_invites',
        filter: `to_user_id=eq.${this.user.id}` },
        async () => { await this._loadInvites(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friends',
        filter: `friend_id=eq.${this.user.id}` },
        async () => { await this._load(); })
      .subscribe();
    this._channels.push(ch);
  }

  // ── Presence ──────────────────────────────────────────────────────────────
  _subscribePresence() {
    // Track self as online, watch friends going online/offline
    const pCh = supabase.channel('hl-presence', { config: { presence: { key: this.user.id } } });
    pCh
      .on('presence', { event: 'sync' }, () => {
        const state = pCh.presenceState();
        this._presenceOnline = {};
        Object.keys(state).forEach(uid => { this._presenceOnline[uid] = true; });
        this._renderContent();
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await pCh.track({ user_id: this.user.id, username: this.profile?.username || '' });
        }
      });
    this._channels.push(pCh);
  }

  // ── Destroy ───────────────────────────────────────────────────────────────
  destroy() {
    this._channels.forEach(c => c.unsubscribe());
    if (this._gameSub) { this._gameSub.unsubscribe(); this._gameSub = null; }
    if (this._el && this._el.parentNode) this._el.parentNode.removeChild(this._el);
    if (this.onClose) this.onClose();
  }
}
