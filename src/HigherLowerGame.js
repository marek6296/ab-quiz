import { getRandomGameSequence } from './higher-lower/hlDataset';
import { supabase } from './lib/supabase';
import { FriendsPanel } from './FriendsPanel';
import { DuelGame } from './DuelGame';
import gsap from 'gsap';

// ─── BLACK + GOLD PALETTE ────────────────────────────────────────────────────
const C = {
  bg: '#050505', bgCard: '#111111', bgCardL: '#1a1a1a',
  border: '#222222', borderL: '#333333',
  gold: '#f59e0b', goldL: '#fbbf24', goldD: '#d97706',
  green: '#22c55e', greenL: '#4ade80',
  red: '#ef4444', redL: '#f87171',
  purple: '#a855f7', purpleL: '#c084fc',
  text: '#ffffff', textSoft: '#d4d4d4', muted: '#737373', dim: '#404040',
  overlay: 'rgba(0,0,0,0.88)',
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const hex2rgba = (hex, a = 1) => {
  const [r, g, b] = [1,3,5].map(i => parseInt(hex.slice(i, i+2), 16));
  return `rgba(${r},${g},${b},${a})`;
};

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function wrapText(ctx, text, cx, y, maxW, lineH) {
  const words = text.split(' ');
  let line = '', lines = [];
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; }
    else line = t;
  }
  if (line) lines.push(line);
  const top = y - (lines.length * lineH) / 2 + lineH / 2;
  lines.forEach((l, i) => ctx.fillText(l, cx, top + i * lineH));
}

function lerp(a, b, t) { return a + (b - a) * t; }

function formatNum(n) { return Number(n).toLocaleString('sk-SK'); }

// ─── PARTICLES ───────────────────────────────────────────────────────────────
class Particles {
  constructor(count = 30) {
    this.pts = Array.from({ length: count }, () => ({
      x: Math.random(), y: Math.random(),
      vx: (Math.random() - 0.5) * 0.0003,
      vy: (Math.random() - 0.5) * 0.0003,
      s: Math.random() * 2.5 + 0.5,
      a: Math.random() * 0.3 + 0.05,
    }));
  }
  update() {
    this.pts.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > 1) p.vx *= -1;
      if (p.y < 0 || p.y > 1) p.vy *= -1;
    });
  }
  draw(ctx, W, H) {
    this.pts.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x * W, p.y * H, p.s, 0, Math.PI * 2);
      ctx.fillStyle = hex2rgba(C.gold, p.a);
      ctx.fill();
    });
  }
}

// ─── GAME ────────────────────────────────────────────────────────────────────
export class HigherLowerGame {
  constructor(canvas, user, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = window.devicePixelRatio || 1;
    this.W = 0; this.H = 0;
    this.user = user;
    this.profile = null;
    this.particles = new Particles(35);
    this.onBack = opts.onBack || null; // callback to return to hub

    // Game state
    this.state = 'menu';
    this.score = 0;
    this.bestScore = 0;
    this.sequence = []; this.metric = ''; this.topic = '';
    this.currentIndex = 0;
    this._guessLocked = false;
    this.difficulty = null; // null = all, 1/2/3
    this.roundNumber = 0;

    // Count-up animation
    this.countUp = { current: 0, target: 0, active: false };

    // Auth
    this.authMode = 'login';
    this.authError = '';
    this.authLoading = false;
    this._inputs = {};
    this._createHTMLOverlay();

    // Anim
    this.anim = {
      menuAlpha: 0, menuY: 40, titleGlow: 0,
      leftX: 0, leftA: 0,
      rightX: 0, rightA: 0, rightScale: 1,
      vsA: 0, flash: 0, flashC: C.green,
      goA: 0, scoreScale: 1,
      bqH: 0, bfH: 0, bhH: 0, blH: 0, brH: 0,
      baH: 0, boH: 0, bdH: [0, 0, 0],
      valReveal: 0,
      authA: 0, authY: 30,
      resultIcon: 0, resultOk: true,
      roundBanner: 0, nextBanner: 0,
    };
    this.hits = {};
    this._time = 0;

    this._resize = this._resize.bind(this);
    this._onMove = this._onMove.bind(this);
    this._onDown = this._onDown.bind(this);
    this._onTouch = this._onTouch.bind(this);
    window.addEventListener('resize', this._resize);
    canvas.addEventListener('mousemove', this._onMove);
    canvas.addEventListener('mousedown', this._onDown);
    canvas.addEventListener('touchstart', this._onTouch, { passive: true });
    this._resize();
  }

  // ── Public ─────────────────────────────────────────────────────────────────
  start() {
    if (this.user) { this._fetchProfile(); this._subscribeInvites(); }
    this._showMenu();
    this._loop();
  }

  destroy() {
    this._dead = true;
    if (this._raf) cancelAnimationFrame(this._raf);
    if (this._inviteChannel) this._inviteChannel.unsubscribe();
    if (this._friendsPanel) this._friendsPanel.destroy();
    window.removeEventListener('resize', this._resize);
    this.canvas.removeEventListener('mousemove', this._onMove);
    this.canvas.removeEventListener('mousedown', this._onDown);
    this.canvas.removeEventListener('touchstart', this._onTouch);
    gsap.killTweensOf(this.anim);
    this._removeHTMLOverlay();
  }

  setUser(user) {
    this.user = user;
    this.profile = null;
    if (user) this._fetchProfile();
    if (this.state === 'auth' || this.state === 'menu') this._showMenu();
  }

  // ── Profile & Invites ─────────────────────────────────────────────────────
  async _fetchProfile() {
    if (!this.user) return;
    const { data } = await supabase.from('profiles').select('*').eq('id', this.user.id).single();
    if (data) this.profile = data;
  }

  _subscribeInvites() {
    if (!this.user) return;
    this._inviteChannel = supabase.channel(`game-invites-${this.user.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'hl_game_invites',
        filter: `to_user_id=eq.${this.user.id}`,
      }, async (payload) => {
        const { data: sender } = await supabase.from('profiles')
          .select('username').eq('id', payload.new.from_user_id).single();
        this._showInviteToast(payload.new, sender?.username || 'Hráč');
      }).subscribe();
  }

  _showInviteToast(invite, fromName) {
    const toast = document.createElement('div');
    Object.assign(toast.style, {
      position: 'fixed', bottom: '32px', left: '50%', transform: 'translateX(-50%) translateY(80px)',
      background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#000',
      padding: '16px 24px', borderRadius: '18px', fontSize: '15px', fontWeight: '700',
      fontFamily: 'Inter, system-ui, sans-serif', zIndex: 999,
      boxShadow: '0 12px 40px rgba(245,158,11,0.4)',
      display: 'flex', alignItems: 'center', gap: '16px', minWidth: '320px',
      transition: 'transform 0.4s cubic-bezier(0.175,0.885,0.32,1.275)',
    });
    toast.innerHTML = `
      <span style="flex:1">⚔️ <b>${fromName}</b> ťa pozýva na duel!</span>
      <button id="tinvite-accept" style="background:#000;border:none;color:#fbbf24;font-weight:700;padding:8px 16px;border-radius:10px;cursor:pointer;font-size:13px;">Prijať</button>
      <button id="tinvite-close" style="background:rgba(0,0,0,0.2);border:none;color:#000;padding:8px 12px;border-radius:10px;cursor:pointer;">✕</button>
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.style.transform = 'translateX(-50%) translateY(0)', 50);
    const dismiss = () => { toast.style.transform = 'translateX(-50%) translateY(120px)'; setTimeout(() => toast.remove(), 400); };
    toast.querySelector('#tinvite-accept').addEventListener('click', async () => {
      dismiss();
      await supabase.from('hl_game_invites').update({ status: 'accepted' }).eq('id', invite.id);
      const { data: game } = await supabase.from('higher_lower_games').select('*').eq('id', invite.game_id).single();
      if (game) this._startDuelGame(game, false);
    });
    toast.querySelector('#tinvite-close').addEventListener('click', async () => {
      dismiss();
      await supabase.from('hl_game_invites').update({ status: 'declined' }).eq('id', invite.id);
    });
    setTimeout(dismiss, 12000);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  _resize() {
    const r = this.canvas.getBoundingClientRect();
    this.W = r.width || window.innerWidth;
    this.H = r.height || window.innerHeight;
    this.canvas.width = this.W * this.dpr;
    this.canvas.height = this.H * this.dpr;
    this.ctx.scale(this.dpr, this.dpr);
  }

  _loop() {
    if (this._dead) return;
    this._raf = requestAnimationFrame(() => this._loop());
    this._time += 0.016;
    this.particles.update();

    // Count-up tick
    if (this.countUp.active) {
      this.countUp.current = lerp(this.countUp.current, this.countUp.target, 0.08);
      if (Math.abs(this.countUp.current - this.countUp.target) < 1) {
        this.countUp.current = this.countUp.target;
        this.countUp.active = false;
      }
    }

    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this._draw();
  }

  // ── Input ─────────────────────────────────────────────────────────────────
  _pos(e) {
    const r = this.canvas.getBoundingClientRect();
    if (e.touches) return { x: e.touches[0].clientX - r.left, y: e.touches[0].clientY - r.top };
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  _hit(pos, area) {
    if (!area) return false;
    return pos.x >= area.x && pos.x <= area.x + area.w && pos.y >= area.y && pos.y <= area.y + area.h;
  }

  _onMove(e) {
    if (this.state === 'auth') return;
    const p = this._pos(e);
    const any = Object.values(this.hits).some(a => a && this._hit(p, a));
    this.canvas.style.cursor = any ? 'pointer' : 'default';
    gsap.to(this.anim, { bqH: this._hit(p, this.hits.bq) ? 1:0, duration: 0.15 });
    gsap.to(this.anim, { bfH: this._hit(p, this.hits.bf) ? 1:0, duration: 0.15 });
    gsap.to(this.anim, { bhH: this._hit(p, this.hits.bh) ? 1:0, duration: 0.15 });
    gsap.to(this.anim, { blH: this._hit(p, this.hits.bl) ? 1:0, duration: 0.15 });
    gsap.to(this.anim, { brH: this._hit(p, this.hits.br) ? 1:0, duration: 0.15 });
    gsap.to(this.anim, { baH: this._hit(p, this.hits.ba) ? 1:0, duration: 0.15 });
    gsap.to(this.anim, { boH: this._hit(p, this.hits.bo) ? 1:0, duration: 0.15 });
    // Difficulty buttons
    for (let i = 0; i < 3; i++) {
      const h = this._hit(p, this.hits[`bd${i}`]);
      this.anim.bdH[i] = lerp(this.anim.bdH[i], h ? 1 : 0, 0.2);
    }
  }

  _onDown(e) { if (this.state !== 'auth') this._handleClick(this._pos(e)); }
  _onTouch(e) { if (this.state !== 'auth') this._handleClick(this._pos(e)); }

  _handleClick(p) {
    if (this.state === 'menu') {
      if (this._hit(p, this.hits.bq)) this._startGame();
      if (this._hit(p, this.hits.bf)) {
        if (!this.user) { this._openAuth(); return; }
        this._openFriends();
      }
      if (this._hit(p, this.hits.ba)) this._openAuth();
      if (this._hit(p, this.hits.bo)) this._logout();
      // Difficulty
      for (let i = 0; i < 3; i++) {
        if (this._hit(p, this.hits[`bd${i}`])) {
          this.difficulty = this.difficulty === (i + 1) ? null : (i + 1);
        }
      }
    } else if (this.state === 'playing') {
      if (this._hit(p, this.hits.bh)) this._guess('higher');
      if (this._hit(p, this.hits.bl)) this._guess('lower');
    } else if (this.state === 'gameover') {
      if (this._hit(p, this.hits.br)) this._backToMenu();
    }
  }

  async _logout() { await supabase.auth.signOut(); }

  _openFriends() {
    if (this._friendsPanel) return;
    this._friendsPanel = new FriendsPanel({
      user: this.user, profile: this.profile,
      onStartDuel: (game, isHost) => { this._friendsPanel = null; this._startDuelGame(game, isHost); },
      onClose: () => { this._friendsPanel = null; },
    });
  }

  async _startDuelGame(game, isHost) {
    this.state = 'duel';
    if (this._duelGame) this._duelGame.destroy();
    this._duelGame = new DuelGame({
      canvas: this.canvas,
      user: this.user,
      profile: this.profile,
      game,
      isHost,
      onEnd: () => {
        this._duelGame = null;
        this._showMenu();
      },
    });
  }

  // ── States ────────────────────────────────────────────────────────────────
  _showMenu() {
    this.state = 'menu';
    this.anim.menuAlpha = 0; this.anim.menuY = 50;
    gsap.to(this.anim, { menuAlpha: 1, menuY: 0, duration: 0.7, ease: 'power3.out' });
    gsap.fromTo(this.anim, { titleGlow: 0 }, { titleGlow: 1, duration: 1.2, ease: 'power2.out' });
  }

  async _startGame() {
    if (this.state === 'loading') return;
    this.state = 'loading';
    gsap.to(this.anim, { menuAlpha: 0, menuY: -50, duration: 0.4, ease: 'power2.in' });
    await new Promise(r => setTimeout(r, 450));

    const data = await getRandomGameSequence(60, this.difficulty);
    this.sequence = data.sequence;
    this.metric = data.metric;
    this.topic = data.topic;
    this.currentIndex = 0;
    this.score = 0;
    this.roundNumber = 1;
    this._guessLocked = false;

    this.state = 'playing';
    this._showRoundBanner();
    this._animIn();
  }

  _showRoundBanner() {
    this.anim.roundBanner = 0;
    gsap.to(this.anim, { roundBanner: 1, duration: 0.4, ease: 'back.out(2)' });
    gsap.to(this.anim, { roundBanner: 0, duration: 0.3, delay: 1.8 });
  }

  _animIn() {
    this.anim.leftX = -400; this.anim.leftA = 0;
    this.anim.rightX = 400; this.anim.rightA = 0; this.anim.rightScale = 0.85;
    this.anim.vsA = 0; this.anim.valReveal = 0;
    this.anim.resultIcon = 0;
    gsap.to(this.anim, { leftX: 0, leftA: 1, duration: 0.65, ease: 'back.out(1.4)', delay: 0.4 });
    gsap.to(this.anim, { rightX: 0, rightA: 1, rightScale: 1, duration: 0.65, ease: 'back.out(1.4)', delay: 0.55 });
    gsap.to(this.anim, { vsA: 1, duration: 0.5, delay: 0.9 });
  }

  _guess(g) {
    if (this.state !== 'playing' || this._guessLocked) return;
    this._guessLocked = true;

    const L = this.sequence[this.currentIndex];
    const R = this.sequence[this.currentIndex + 1];
    const isH = Number(R.value) >= Number(L.value);
    const ok = (g === 'higher' && isH) || (g === 'lower' && !isH);

    // Start count-up animation
    this.countUp = { current: 0, target: Number(R.value), active: true };

    // Fade in revealed value + hide VS
    gsap.to(this.anim, { valReveal: 1, vsA: 0, duration: 0.6 });

    // Result icon pulse
    this.anim.resultOk = ok;
    gsap.fromTo(this.anim, { resultIcon: 0 }, { resultIcon: 1, duration: 0.5, delay: 0.6, ease: 'back.out(2)' });

    // Flash
    this.anim.flashC = ok ? C.green : C.red;
    gsap.fromTo(this.anim, { flash: 0.5 }, { flash: 0, duration: 0.8, delay: 0.5 });

    if (ok) {
      this.score++;
      if (this.score > this.bestScore) this.bestScore = this.score;
      gsap.fromTo(this.anim, { scoreScale: 1.8 }, { scoreScale: 1, duration: 0.6, ease: 'elastic.out(1,0.35)', delay: 0.7 });
      // Pauza 2s potom ďalšie kolo
      setTimeout(() => this._next(), 2200);
    } else {
      if (this.user) this._saveScore();
      setTimeout(() => {
        this.state = 'gameover';
        this.anim.goA = 0;
        gsap.to(this.anim, { goA: 1, duration: 0.6, ease: 'power2.out' });
      }, 2200);
    }
  }

  async _saveScore() {
    try {
      await supabase.from('higher_lower_games').insert({
        host_id: this.user.id, status: 'finished',
        state: { final_score: this.score, topic: this.topic },
      });
    } catch {}
  }

  _next() {
    this.currentIndex++;
    this.roundNumber++;

    // Phase 1: Slide BOTH cards out simultaneously
    gsap.to(this.anim, { leftX: -500, leftA: 0, duration: 0.5, ease: 'power3.in' });
    gsap.to(this.anim, { rightX: 500, rightA: 0, duration: 0.5, ease: 'power3.in' });
    gsap.to(this.anim, { vsA: 0, duration: 0.25 });

    // Phase 2: Cards gone – show "Ďalšia otázka" banner with pause
    setTimeout(() => {
      this.anim.valReveal = 0;
      this.anim.resultIcon = 0;
      this.countUp = { current: 0, target: 0, active: false };

      // Reset positions (off-screen)
      this.anim.leftX = -500; this.anim.leftA = 0;
      this.anim.rightX = 500; this.anim.rightA = 0; this.anim.rightScale = 0.85;
      this.anim.vsA = 0;

      // Show "Ďalšia otázka" banner
      this.anim.nextBanner = 0;
      gsap.to(this.anim, { nextBanner: 1, duration: 0.4, ease: 'back.out(2)' });

      // Phase 3: After banner pause, hide it and slide new cards in
      setTimeout(() => {
        gsap.to(this.anim, { nextBanner: 0, duration: 0.3 });
        this._guessLocked = false;
        this._showRoundBanner();

        gsap.to(this.anim, { leftX: 0, leftA: 1, duration: 0.6, ease: 'back.out(1.4)', delay: 0.25 });
        gsap.to(this.anim, { rightX: 0, rightA: 1, rightScale: 1, duration: 0.65, ease: 'back.out(1.4)', delay: 0.45 });
        gsap.to(this.anim, { vsA: 1, duration: 0.4, delay: 0.8 });
      }, 1000);
    }, 600);
  }

  _backToMenu() {
    if (this.onBack) {
      // Return to hub
      this.onBack();
      return;
    }
    gsap.to(this.anim, { goA: 0, duration: 0.3, onComplete: () => {
      this._guessLocked = false;
      this._showMenu();
    }});
  }

  // ── Auth overlay (HTML) ───────────────────────────────────────────────────
  _createHTMLOverlay() {
    this._overlay = document.createElement('div');
    this._overlay.id = 'auth-overlay';
    Object.assign(this._overlay.style, {
      position: 'fixed', inset: 0, display: 'none', alignItems: 'center', justifyContent: 'center',
      zIndex: 10, pointerEvents: 'none', flexDirection: 'column', gap: '12px',
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
    });

    const makeInput = (id, type, placeholder) => {
      const el = document.createElement('input');
      el.id = id; el.type = type; el.placeholder = placeholder;
      el.autocomplete = type === 'password' ? 'current-password' : (id === 'email' ? 'email' : 'username');
      Object.assign(el.style, {
        width: '320px', height: '52px', padding: '0 20px',
        background: '#111', border: `2px solid #333`, borderRadius: '14px',
        color: '#fff', fontSize: '16px', fontFamily: 'Inter, system-ui, sans-serif',
        outline: 'none', pointerEvents: 'all', boxSizing: 'border-box', transition: 'border-color 0.2s',
      });
      el.addEventListener('focus', () => el.style.borderColor = C.gold);
      el.addEventListener('blur', () => el.style.borderColor = '#333');
      return el;
    };

    this._inputs.email = makeInput('hl-email', 'email', 'E-mail');
    this._inputs.username = makeInput('hl-username', 'text', 'Prezývka');
    this._inputs.password = makeInput('hl-password', 'password', 'Heslo');

    this._submitBtn = document.createElement('button');
    Object.assign(this._submitBtn.style, {
      width: '320px', height: '52px', background: C.gold, border: 'none',
      borderRadius: '14px', color: '#000', fontSize: '17px', fontWeight: '800',
      fontFamily: 'Inter, system-ui, sans-serif', cursor: 'pointer', pointerEvents: 'all',
    });
    this._submitBtn.addEventListener('click', () => this._handleAuthSubmit());

    this._authErrEl = document.createElement('div');
    Object.assign(this._authErrEl.style, { color: C.red, fontSize: '14px', fontFamily: 'Inter', textAlign: 'center', maxWidth: '320px', pointerEvents: 'none' });

    this._switchLink = document.createElement('button');
    Object.assign(this._switchLink.style, {
      background: 'none', border: 'none', color: C.goldL, fontSize: '14px',
      fontFamily: 'Inter', cursor: 'pointer', pointerEvents: 'all', textDecoration: 'underline',
    });
    this._switchLink.addEventListener('click', () => {
      this.authMode = this.authMode === 'login' ? 'register' : 'login';
      this.authError = ''; this._authErrEl.textContent = '';
      this._updateAuthOverlay();
    });

    this._overlay.append(this._inputs.email, this._inputs.username, this._inputs.password, this._submitBtn, this._authErrEl, this._switchLink);
    document.body.appendChild(this._overlay);
  }

  _removeHTMLOverlay() { if (this._overlay?.parentNode) this._overlay.parentNode.removeChild(this._overlay); }
  _showHTMLAuth() { this._overlay.style.display = 'flex'; this._updateAuthOverlay(); }
  _hideHTMLAuth() { this._overlay.style.display = 'none'; }

  _updateAuthOverlay() {
    const isReg = this.authMode === 'register';
    this._inputs.username.style.display = isReg ? 'block' : 'none';
    this._submitBtn.textContent = isReg ? 'Vytvoriť účet' : 'Prihlásiť sa';
    this._switchLink.textContent = isReg ? 'Už mám účet → Prihlásiť' : 'Nemám účet → Registrácia';

    this._overlay.innerHTML = '';
    const title = document.createElement('div');
    Object.assign(title.style, { color: C.gold, fontSize: '26px', fontWeight: '900', fontFamily: 'Inter', marginBottom: '8px', pointerEvents: 'none' });
    title.textContent = isReg ? '🎮 Nový účet' : '🔑 Prihlásenie';
    this._overlay.append(title, this._inputs.email);
    if (isReg) this._overlay.append(this._inputs.username);
    this._overlay.append(this._inputs.password, this._submitBtn, this._authErrEl, this._switchLink);

    const skipBtn = document.createElement('button');
    Object.assign(skipBtn.style, { background: 'none', border: `1px solid #333`, color: '#666', fontSize: '13px', fontFamily: 'Inter', cursor: 'pointer', pointerEvents: 'all', borderRadius: '10px', padding: '8px 20px', marginTop: '8px' });
    skipBtn.textContent = 'Hrať bez konta';
    skipBtn.addEventListener('click', () => this._closeAuth());
    this._overlay.append(skipBtn);
  }

  async _handleAuthSubmit() {
    if (this.authLoading) return;
    this.authLoading = true; this._submitBtn.textContent = 'Čakaj...'; this._authErrEl.textContent = '';
    const email = this._inputs.email.value.trim();
    const password = this._inputs.password.value;
    const username = this._inputs.username.value.trim();
    try {
      if (this.authMode === 'register') {
        if (!username) throw new Error('Zadaj prezývku!');
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        const { data: { user } } = await supabase.auth.getUser();
        if (user) await supabase.from('profiles').upsert({ id: user.id, email, username }, { onConflict: 'id' });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      this._closeAuth();
    } catch (err) {
      this._authErrEl.textContent = err.message || 'Chyba';
    } finally {
      this.authLoading = false; this._updateAuthOverlay();
    }
  }

  _openAuth() { this.state = 'auth'; this._showHTMLAuth(); }
  _closeAuth() { this._hideHTMLAuth(); this._showMenu(); }

  // ── Drawing ────────────────────────────────────────────────────────────────
  _draw() {
    const { ctx, W, H } = this;

    // Black BG
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    // Subtle radial vignette
    const vig = ctx.createRadialGradient(W/2, H/2, H*0.2, W/2, H/2, H*0.9);
    vig.addColorStop(0, 'rgba(30,30,30,0.12)');
    vig.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);

    // Particles (always)
    this.particles.draw(ctx, W, H);

    // If duel is active, it renders itself on the same canvas – skip main draw
    if (this.state === 'duel') return;

    if (this.state === 'menu' || this.anim.menuAlpha > 0.01) this._drawMenu();
    if (['playing','gameover'].includes(this.state)) this._drawGame();
    if (this.state === 'loading') this._drawLoading();
    if (this.state === 'gameover' && this.anim.goA > 0.01) this._drawGameOver();
    if (this.state === 'auth') { ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, W, H); }

    // Flash
    if (this.anim.flash > 0) {
      ctx.fillStyle = hex2rgba(this.anim.flashC, this.anim.flash * 0.25);
      ctx.fillRect(0, 0, W, H);
    }
  }

  // ── MENU ──────────────────────────────────────────────────────────────────
  _drawMenu() {
    const { ctx, W, H, anim } = this;
    ctx.save();
    ctx.globalAlpha = anim.menuAlpha;
    const yo = anim.menuY;
    const cx = W / 2, cy = H / 2;

    // Gold aura behind title
    const glow = ctx.createRadialGradient(cx, cy - 100 + yo, 10, cx, cy - 100 + yo, 320);
    glow.addColorStop(0, hex2rgba(C.gold, 0.12 * anim.titleGlow));
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(cx - 350, cy - 350 + yo, 700, 500);

    // Title: HIGHER OR LOWER
    const fz = Math.max(34, Math.min(64, W * 0.08));
    ctx.save();
    ctx.font = `900 ${fz}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    const tg = ctx.createLinearGradient(cx - 250, 0, cx + 250, 0);
    const shift = (Math.sin(this._time * 0.8) + 1) / 2;
    tg.addColorStop(0, C.goldD);
    tg.addColorStop(shift * 0.5, C.goldL);
    tg.addColorStop(0.5, '#fff');
    tg.addColorStop(0.5 + shift * 0.5, C.goldL);
    tg.addColorStop(1, C.goldD);
    ctx.fillStyle = tg;
    ctx.fillText('HIGHER OR LOWER', cx, cy - 120 + yo);
    ctx.restore();

    // Subtitle with animated arrow
    const arrows = '▲▼';
    ctx.font = `400 ${Math.max(12, Math.min(17, W * 0.02))}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = C.muted; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`${arrows}  Uhádni čo je viac a čo menej  ${arrows}`, cx, cy - 62 + yo);

    // Best score
    if (this.bestScore > 0) {
      ctx.font = `700 15px Inter, system-ui, sans-serif`;
      ctx.fillStyle = C.gold;
      ctx.fillText(`🏆 Rekord: ${this.bestScore}`, cx, cy - 30 + yo);
    }

    // Difficulty selector
    const diffLabels = ['Ľahká', 'Stredná', 'Ťažká'];
    const diffColors = [C.green, C.gold, C.red];
    const dbw = 90, dbh = 38, dgap = 12;
    const dtotalW = dbw * 3 + dgap * 2;
    const dsy = cy - 4 + yo;
    for (let i = 0; i < 3; i++) {
      const dx = cx - dtotalW / 2 + i * (dbw + dgap);
      const da = { x: dx, y: dsy, w: dbw, h: dbh };
      this.hits[`bd${i}`] = da;
      const active = this.difficulty === (i + 1);
      const hover = this.anim.bdH[i];
      ctx.save();
      rr(ctx, dx, dsy, dbw, dbh, 12);
      ctx.fillStyle = active ? hex2rgba(diffColors[i], 0.25) : `rgba(255,255,255,${0.03 + hover * 0.05})`;
      ctx.fill();
      ctx.strokeStyle = active ? diffColors[i] : `rgba(255,255,255,${0.1 + hover * 0.15})`;
      ctx.lineWidth = active ? 2 : 1; ctx.stroke();
      ctx.font = `${active ? 700 : 500} 13px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = active ? diffColors[i] : `rgba(255,255,255,${0.7 + hover * 0.3})`;
      ctx.fillText(diffLabels[i], dx + dbw / 2, dsy + dbh / 2);
      ctx.restore();
    }
    // Label above difficulty
    ctx.font = `500 11px Inter, system-ui, sans-serif`;
    ctx.fillStyle = `rgba(255,255,255,0.25)`;
    ctx.fillText(this.difficulty ? '' : 'Obtiažnosť (všetky)', cx, dsy - 12);

    const bw = 260, bh = 58;

    // RÝCHLA HRA button
    const bq = { x: cx - bw/2, y: dsy + dbh + 24, w: bw, h: bh };
    this.hits.bq = bq;
    this._drawGoldBtn(bq, '⚡  HRAŤ', anim.bqH);

    // ONLINE DUEL button
    const bf = { x: cx - bw/2, y: bq.y + bh + 14, w: bw, h: bh };
    this.hits.bf = bf;
    this._drawOutlineBtn(bf, '⚔️  ONLINE DUEL', C.purple, anim.bfH);

    // User section
    this._drawUserSection(cx, bf.y + bh + 24);
    ctx.restore();
  }

  _drawGoldBtn(area, label, hover) {
    const { ctx } = this;
    ctx.save();
    ctx.shadowColor = C.gold; ctx.shadowBlur = 12 + hover * 24;
    const g = ctx.createLinearGradient(area.x, area.y, area.x, area.y + area.h);
    g.addColorStop(0, hover ? C.goldL : C.gold);
    g.addColorStop(1, hover ? C.gold : C.goldD);
    rr(ctx, area.x, area.y, area.w, area.h, 16);
    ctx.fillStyle = g; ctx.fill(); ctx.shadowBlur = 0;
    ctx.font = `800 20px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000';
    ctx.fillText(label, area.x + area.w / 2, area.y + area.h / 2);
    ctx.restore();
  }

  _drawOutlineBtn(area, label, color, hover) {
    const { ctx } = this;
    ctx.save();
    ctx.shadowColor = color; ctx.shadowBlur = hover * 16;
    rr(ctx, area.x, area.y, area.w, area.h, 16);
    ctx.fillStyle = hover ? hex2rgba(color, 0.12) : 'rgba(255,255,255,0.03)';
    ctx.fill();
    ctx.strokeStyle = hover ? color : hex2rgba(color, 0.5);
    ctx.lineWidth = 2; ctx.stroke(); ctx.shadowBlur = 0;
    ctx.font = `700 18px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = hover ? '#fff' : hex2rgba(color, 0.8);
    ctx.fillText(label, area.x + area.w / 2, area.y + area.h / 2);
    ctx.restore();
  }

  _drawUserSection(cx, y) {
    const { ctx, anim } = this;
    if (this.user) {
      const name = this.profile?.username || this.user.email?.split('@')[0] || 'Hráč';
      ctx.font = `500 14px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = C.muted;
      ctx.fillText(`👤 ${name}`, cx, y);
      const bo = { x: cx - 70, y: y + 18, w: 140, h: 34 };
      this.hits.bo = bo;
      ctx.save(); ctx.globalAlpha = 0.6 + anim.boH * 0.4;
      rr(ctx, bo.x, bo.y, bo.w, bo.h, 10);
      ctx.strokeStyle = '#333'; ctx.lineWidth = 1; ctx.stroke();
      ctx.font = `500 12px Inter, system-ui, sans-serif`;
      ctx.fillStyle = '#666';
      ctx.fillText('Odhlásiť sa', cx, bo.y + 17);
      ctx.restore();
    } else {
      const ba = { x: cx - 95, y, w: 190, h: 40 };
      this.hits.ba = ba;
      ctx.save();
      rr(ctx, ba.x, ba.y, ba.w, ba.h, 12);
      ctx.fillStyle = anim.baH ? hex2rgba(C.gold, 0.15) : 'rgba(255,255,255,0.04)';
      ctx.fill();
      ctx.strokeStyle = anim.baH ? C.gold : '#444';
      ctx.lineWidth = 1; ctx.stroke();
      ctx.font = `600 14px Inter, system-ui, sans-serif`;
      ctx.fillStyle = anim.baH ? C.goldL : '#888';
      ctx.fillText('🔑 Prihlásiť sa', cx, ba.y + 20);
      ctx.restore();
    }
  }

  // ── GAME ──────────────────────────────────────────────────────────────────
  _drawGame() {
    const { ctx, W, H, anim } = this;
    const mobile = W < 600;
    const cx = W / 2, cy = H / 2;
    const L = this.sequence[this.currentIndex];
    const R = this.sequence[this.currentIndex + 1];
    if (!L || !R) return;

    // Top bar: score + topic
    const scoreY = mobile ? 24 : 36;
    ctx.save();
    ctx.translate(cx, scoreY); ctx.scale(anim.scoreScale, anim.scoreScale);
    ctx.font = `900 ${mobile ? 20 : Math.max(18, Math.min(26, W * 0.03))}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = C.gold;
    ctx.shadowColor = C.gold; ctx.shadowBlur = this.score > 0 ? 16 : 0;
    ctx.fillText(`${this.score}`, 0, 0);
    ctx.restore();

    ctx.save();
    ctx.font = `500 ${mobile ? 10 : Math.max(11, Math.min(13, W * 0.015))}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = C.muted;
    ctx.fillText(this.topic, cx, mobile ? 48 : 67);
    ctx.restore();

    // Round banner
    if (anim.roundBanner > 0.01) {
      ctx.save();
      ctx.globalAlpha = anim.roundBanner;
      ctx.font = `800 ${mobile ? 13 : 16}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = C.gold;
      ctx.fillText(`Kolo ${this.roundNumber}`, cx, mobile ? 68 : 95);
      ctx.restore();
    }

    // "Ďalšia otázka" transition banner
    if (anim.nextBanner > 0.01) {
      ctx.save();
      ctx.globalAlpha = anim.nextBanner;
      ctx.translate(cx, cy);
      const s = 0.7 + anim.nextBanner * 0.3;
      ctx.scale(s, s);
      ctx.font = `900 ${mobile ? 24 : 32}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = C.gold; ctx.shadowBlur = 25;
      ctx.fillStyle = C.gold;
      ctx.fillText('Ďalšia otázka ▶', 0, 0);
      ctx.shadowBlur = 0;
      ctx.font = `500 ${mobile ? 12 : 14}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = C.muted;
      ctx.fillText(`Kolo ${this.roundNumber}`, 0, mobile ? 28 : 35);
      ctx.restore();
    }

    // Skip cards while "Ďalšia otázka" banner is visible
    if (anim.nextBanner > 0.05) {
      // Don't draw cards during transition banner
    } else if (mobile) {
      const CW = Math.min(W - 24, 320);
      const CH = 150;
      const topStart = 80;
      const gap = 14;
      const c1y = topStart + CH / 2;
      const c2y = topStart + CH + gap + CH / 2;
      const vsY = topStart + CH + gap / 2;

      this._drawCard(cx + anim.leftX, c1y, L, true, anim.leftA, 1, CW, CH);
      this._drawCard(cx + anim.rightX, c2y, R, false, anim.rightA, anim.rightScale, CW, CH);

      if (anim.vsA > 0.01) {
        ctx.save();
        ctx.globalAlpha = anim.vsA * 0.3;
        ctx.font = '800 18px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = C.dim;
        ctx.fillText('VS', cx, vsY);
        ctx.restore();
      }
    } else {
      const gapX = 210;
      this._drawCard(cx - gapX + anim.leftX, cy, L, true, anim.leftA, 1, 310, 360);
      this._drawCard(cx + gapX + anim.rightX, cy, R, false, anim.rightA, anim.rightScale, 310, 360);

      if (anim.vsA > 0.01) {
        ctx.save();
        ctx.globalAlpha = anim.vsA * 0.3;
        ctx.font = `900 18px Inter, system-ui, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#555';
        ctx.fillText('VS', cx, cy);
        ctx.restore();
      }
    }

    // Result icon (✓ or ✕)
    if (anim.resultIcon > 0.01) {
      ctx.save();
      ctx.globalAlpha = anim.resultIcon;
      ctx.translate(cx, cy);
      ctx.scale(anim.resultIcon, anim.resultIcon);
      ctx.font = `900 ${mobile ? 36 : 48}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = anim.resultOk ? C.green : C.red;
      ctx.shadowColor = anim.resultOk ? C.green : C.red;
      ctx.shadowBlur = 30;
      ctx.fillText(anim.resultOk ? '✓' : '✕', 0, 0);
      ctx.restore();
    }
  }

  _drawCard(cx, cy, item, revealed, alpha, scale, CW, CH) {
    const { ctx, W } = this;
    const mobile = W < 600;
    const CR = mobile ? 14 : 20;
    const x = cx - CW / 2, y = cy - CH / 2;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cy);

    // Card bg
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = mobile ? 15 : 30; ctx.shadowOffsetY = mobile ? 5 : 10;
    rr(ctx, x, y, CW, CH, CR);
    const bg = ctx.createLinearGradient(x, y, x, y + CH);
    bg.addColorStop(0, '#151515'); bg.addColorStop(1, '#0a0a0a');
    ctx.fillStyle = bg; ctx.fill();
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

    // Border
    rr(ctx, x, y, CW, CH, CR);
    ctx.strokeStyle = revealed ? hex2rgba(C.gold, 0.3) : 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1.5; ctx.stroke();

    if (!mobile) {
      const shine = ctx.createLinearGradient(x, y, x, y + 60);
      shine.addColorStop(0, 'rgba(255,255,255,0.04)');
      shine.addColorStop(1, 'rgba(255,255,255,0)');
      rr(ctx, x, y, CW, 60, CR);
      ctx.fillStyle = shine; ctx.fill();
    }

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

    if (mobile) {
      // ── Mobile compact: emoji left, name+value right, buttons bottom ──
      ctx.font = '30px serif';
      ctx.fillText(item.image || '❓', x + 35, cy - 15);

      ctx.font = `700 ${item.name.length > 20 ? 13 : 15}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = '#fff';
      wrapText(ctx, item.name, cx + 10, cy - 18, CW - 85, 18);

      if (revealed) {
        const val = `${formatNum(item.value)} ${this.metric}`;
        ctx.font = '900 13px Inter, system-ui, sans-serif';
        ctx.fillStyle = C.gold; ctx.shadowColor = C.gold; ctx.shadowBlur = 6;
        ctx.fillText(val, cx + 10, cy + 8);
        ctx.shadowBlur = 0;
      } else {
        if (this.anim.valReveal > 0.01) {
          ctx.save();
          ctx.globalAlpha = this.anim.valReveal;
          ctx.font = '900 13px Inter, system-ui, sans-serif';
          ctx.fillStyle = C.gold; ctx.shadowColor = C.gold; ctx.shadowBlur = 6;
          ctx.fillText(`${formatNum(Math.round(this.countUp.current))} ${this.metric}`, cx + 10, cy + 8);
          ctx.restore();
        }
        const btnA = 1 - Math.min(1, this.anim.valReveal * 2.5);
        if (btnA > 0.01) {
          ctx.save();
          ctx.globalAlpha *= btnA;
          const bw = (CW - 20) / 2 - 4, bh = 32, by = y + CH - bh - 8;
          const bha = { x: x + 6, y: by, w: bw, h: bh };
          this.hits.bh = bha;
          rr(ctx, bha.x, bha.y, bw, bh, 10);
          ctx.fillStyle = this.anim.bhH ? C.greenL : C.green; ctx.fill();
          ctx.font = '800 12px Inter, system-ui, sans-serif';
          ctx.fillStyle = '#000';
          ctx.fillText('▲ HIGHER', x + 6 + bw / 2, by + bh / 2);
          const bla = { x: x + 6 + bw + 8, y: by, w: bw, h: bh };
          this.hits.bl = bla;
          rr(ctx, bla.x, bla.y, bw, bh, 10);
          ctx.fillStyle = this.anim.blH ? C.redL : C.red; ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.fillText('▼ LOWER', bla.x + bw / 2, by + bh / 2);
          ctx.restore();
        }
      }
    } else {
      // ── Desktop: vertical card ──
      ctx.font = '56px serif';
      ctx.fillText(item.image || '❓', cx, y + 80);
      ctx.font = `700 ${item.name.length > 18 ? 17 : 21}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = '#fff';
      wrapText(ctx, item.name, cx, y + 160, CW - 32, 26);

      if (revealed) {
        const val = `${formatNum(item.value)} ${this.metric}`;
        ctx.font = `900 ${val.length > 18 ? 16 : 19}px Inter, system-ui, sans-serif`;
        ctx.fillStyle = C.gold; ctx.shadowColor = C.gold; ctx.shadowBlur = 8;
        ctx.fillText(val, cx, y + 210);
        ctx.shadowBlur = 0;
      } else {
        if (this.anim.valReveal > 0.01) {
          ctx.save();
          ctx.globalAlpha = this.anim.valReveal;
          const val = `${formatNum(Math.round(this.countUp.current))} ${this.metric}`;
          ctx.font = `900 ${val.length > 18 ? 16 : 19}px Inter, system-ui, sans-serif`;
          ctx.fillStyle = C.gold; ctx.shadowColor = C.gold; ctx.shadowBlur = 8;
          ctx.fillText(val, cx, y + 210);
          ctx.restore();
        }
        const btnA = 1 - Math.min(1, this.anim.valReveal * 2.5);
        if (btnA > 0.01) {
          ctx.save();
          ctx.globalAlpha *= btnA;
          const bw = 180, bh = 48, bx = cx - bw / 2;
          const by1 = y + CH - 125, by2 = y + CH - 65;
          const bha = { x: bx, y: by1 - bh/2, w: bw, h: bh };
          this.hits.bh = bha;
          ctx.shadowColor = C.green; ctx.shadowBlur = this.anim.bhH * 20;
          const gh = ctx.createLinearGradient(bx, bha.y, bx, bha.y + bh);
          gh.addColorStop(0, this.anim.bhH ? C.greenL : C.green);
          gh.addColorStop(1, this.anim.bhH ? C.green : '#15803d');
          rr(ctx, bx, bha.y, bw, bh, 14); ctx.fillStyle = gh; ctx.fill();
          ctx.shadowBlur = 0;
          ctx.font = '800 16px Inter, system-ui, sans-serif';
          ctx.fillStyle = '#000'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('▲ HIGHER', cx, by1);
          const bla = { x: bx, y: by2 - bh/2, w: bw, h: bh };
          this.hits.bl = bla;
          ctx.shadowColor = C.red; ctx.shadowBlur = this.anim.blH * 20;
          const gl = ctx.createLinearGradient(bx, bla.y, bx, bla.y + bh);
          gl.addColorStop(0, this.anim.blH ? C.redL : C.red);
          gl.addColorStop(1, this.anim.blH ? C.red : '#991b1b');
          rr(ctx, bx, bla.y, bw, bh, 14); ctx.fillStyle = gl; ctx.fill();
          ctx.shadowBlur = 0;
          ctx.fillStyle = '#fff';
          ctx.fillText('▼ LOWER', cx, by2);
          ctx.restore();
        }
      }
    }

    ctx.restore();
  }

  _drawLoading() {
    const { ctx, W, H } = this;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, W, H);
    ctx.font = `700 20px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = C.muted;
    ctx.fillText('Načítavam' + '.'.repeat(Math.floor(Date.now()/400)%4), W/2, H/2);
    ctx.restore();
  }

  _drawGameOver() {
    const { ctx, W, H, anim } = this;
    ctx.save();
    ctx.globalAlpha = anim.goA;
    ctx.fillStyle = C.overlay; ctx.fillRect(0, 0, W, H);
    const cx = W/2, cy = H/2;
    const pw = Math.min(420, W - 40), ph = 360;
    const px = cx - pw/2, py = cy - ph/2;

    // Panel
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 50;
    rr(ctx, px, py, pw, ph, 28);
    const pbg = ctx.createLinearGradient(px, py, px, py+ph);
    pbg.addColorStop(0, '#151515'); pbg.addColorStop(1, '#0a0a0a');
    ctx.fillStyle = pbg; ctx.fill(); ctx.shadowBlur = 0;
    rr(ctx, px, py, pw, ph, 28);
    ctx.strokeStyle = hex2rgba(C.red, 0.5);
    ctx.lineWidth = 1.5; ctx.stroke();

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

    // Title
    ctx.font = `900 44px Inter, system-ui, sans-serif`;
    ctx.shadowColor = C.red; ctx.shadowBlur = 22;
    ctx.fillStyle = C.red;
    ctx.fillText('GAME OVER', cx, py + 70);
    ctx.shadowBlur = 0;

    // Score label
    ctx.font = `500 17px Inter, system-ui, sans-serif`;
    ctx.fillStyle = C.muted;
    ctx.fillText('Tvoje skóre', cx, cy - 28);

    // Score
    ctx.font = `900 72px Inter, system-ui, sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.shadowColor = C.gold; ctx.shadowBlur = this.score > 0 ? 24 : 0;
    ctx.fillText(`${this.score}`, cx, cy + 52);
    ctx.shadowBlur = 0;

    // Record
    if (this.bestScore > this.score) {
      ctx.font = `500 14px Inter`; ctx.fillStyle = C.muted;
      ctx.fillText(`Rekord: ${this.bestScore}`, cx, cy + 100);
    } else if (this.score > 0) {
      ctx.font = `700 14px Inter`; ctx.fillStyle = C.gold;
      ctx.fillText('🏆 Nový rekord!', cx, cy + 100);
    }

    // Restart
    const rbw = 220, rbh = 52;
    const rb = { x: cx - rbw/2, y: py + ph - 72, w: rbw, h: rbh };
    this.hits.br = rb;
    this._drawGoldBtn(rb, '🔄 Hrať znova', anim.brH);

    ctx.restore();
  }
}
