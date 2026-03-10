import { supabase } from './lib/supabase';
import { FriendsPanel } from './FriendsPanel';
import gsap from 'gsap';

// ─── PALETTE ─────────────────────────────────────────────────────────────────
const C = {
  bg: '#050505', bgCard: '#111111',
  gold: '#f59e0b', goldL: '#fbbf24', goldD: '#d97706',
  green: '#22c55e', purple: '#a855f7',
  text: '#ffffff', muted: '#737373', dim: '#404040',
};

const hex2rgba = (hex, a) => {
  const [r, g, b] = [1,3,5].map(i => parseInt(hex.slice(i, i+2), 16));
  return `rgba(${r},${g},${b},${a})`;
};

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

// ─── PARTICLES ───────────────────────────────────────────────────────────────
class Particles {
  constructor(count = 35) {
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

// ─── GAME CARDS DATA ─────────────────────────────────────────────────────────
const GAMES = [
  {
    id: 'higher-lower',
    emoji: '🎴',
    title: 'Higher or Lower',
    desc: 'Uhádni čo je viac a čo menej',
    color: C.gold,
    colorL: C.goldL,
  },
  {
    id: 'quiz-duel',
    emoji: '🎯',
    title: 'Kvíz Duel',
    desc: '1v1 vedomostný súboj',
    color: C.green,
    colorL: '#4ade80',
  },
  {
    id: 'millionaire',
    emoji: '💰',
    title: 'Milionár Battle',
    desc: 'Kto bude milionár?',
    color: C.purple,
    colorL: '#c084fc',
  },
];

// ─── GAME HUB ────────────────────────────────────────────────────────────────
export class GameHub {
  constructor(canvas, user, { onSelectGame }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = window.devicePixelRatio || 1;
    this.W = 0; this.H = 0;
    this.user = user;
    this.profile = null;
    this.particles = new Particles(40);
    this.onSelectGame = onSelectGame;

    this._dead = false;
    this._time = 0;

    // Auth overlay
    this.authMode = 'login';
    this.authError = '';
    this.authLoading = false;
    this._inputs = {};
    this._createHTMLOverlay();
    this.showAuth = false;

    // Anim
    this.anim = {
      titleA: 0, titleY: -30, titleGlow: 0,
      cardsA: 0, cardsY: 40,
      profileA: 0,
      cardHover: [0, 0, 0],
      authA: 0, authY: 30,
      friendsH: 0, loginH: 0, adminH: 0,
    };
    this.hits = {};

    // Friends
    this._friendsPanel = null;
    this._inviteChannel = null;

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

  start() {
    if (this.user) { this._fetchProfile(); this._subscribeInvites(); }
    this._animateIn();
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
    if (user) { this._fetchProfile(); this._subscribeInvites(); }
  }

  // ── Profile ────────────────────────────────────────────────────────────────
  async _fetchProfile() {
    if (!this.user) return;
    const { data } = await supabase.from('profiles').select('*').eq('id', this.user.id).single();
    if (data) this.profile = data;
  }

  _subscribeInvites() {
    if (!this.user || this._inviteChannel) return;
    this._inviteChannel = supabase.channel(`hub-invites-${this.user.id}`)
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
      display: 'flex', alignItems: 'center', gap: '16px', minWidth: '280px',
      transition: 'transform 0.4s cubic-bezier(0.175,0.885,0.32,1.275)',
    });
    toast.innerHTML = `
      <span style="flex:1">⚔️ <b>${fromName}</b> ťa pozýva!</span>
      <button id="tinvite-accept" style="background:#000;border:none;color:#fbbf24;font-weight:700;padding:8px 16px;border-radius:10px;cursor:pointer;font-size:13px;">Prijať</button>
      <button id="tinvite-close" style="background:rgba(0,0,0,0.2);border:none;color:#000;padding:8px 12px;border-radius:10px;cursor:pointer;">✕</button>
    `;
    document.body.appendChild(toast);
    requestAnimationFrame(() => { toast.style.transform = 'translateX(-50%) translateY(0)'; });

    toast.querySelector('#tinvite-accept').onclick = () => {
      toast.remove();
      // Route to Higher or Lower with accept
      this.onSelectGame('higher-lower', { invite });
    };
    toast.querySelector('#tinvite-close').onclick = () => {
      toast.style.transform = 'translateX(-50%) translateY(120px)';
      setTimeout(() => toast.remove(), 400);
    };
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 15000);
  }

  // ── Animation ──────────────────────────────────────────────────────────────
  _animateIn() {
    gsap.to(this.anim, { titleA: 1, titleY: 0, duration: 0.7, ease: 'back.out(1.4)', delay: 0.1 });
    gsap.to(this.anim, { titleGlow: 1, duration: 1.5, delay: 0.4 });
    gsap.to(this.anim, { cardsA: 1, cardsY: 0, duration: 0.6, ease: 'back.out(1.2)', delay: 0.35 });
    gsap.to(this.anim, { profileA: 1, duration: 0.5, delay: 0.6 });
  }

  // ── Resize ─────────────────────────────────────────────────────────────────
  _resize() {
    const r = this.canvas.getBoundingClientRect();
    this.W = r.width || window.innerWidth;
    this.H = r.height || window.innerHeight;
    this.canvas.width = this.W * this.dpr;
    this.canvas.height = this.H * this.dpr;
  }

  // ── Input ──────────────────────────────────────────────────────────────────
  _pos(e) {
    const r = this.canvas.getBoundingClientRect();
    if (e.touches) return { x: e.touches[0].clientX - r.left, y: e.touches[0].clientY - r.top };
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  _hit(p, a) { return a && p.x >= a.x && p.x <= a.x + a.w && p.y >= a.y && p.y <= a.y + a.h; }

  _onMove(e) {
    const p = this._pos(e);
    GAMES.forEach((_, i) => {
      gsap.to(this.anim.cardHover, { [i]: this._hit(p, this.hits[`card${i}`]) ? 1 : 0, duration: 0.2 });
    });
    gsap.to(this.anim, { friendsH: this._hit(p, this.hits.friends) ? 1 : 0, duration: 0.15 });
    gsap.to(this.anim, { loginH: this._hit(p, this.hits.login) ? 1 : 0, duration: 0.15 });
    gsap.to(this.anim, { adminH: this._hit(p, this.hits.admin) ? 1 : 0, duration: 0.15 });
    const any = GAMES.some((_, i) => this._hit(p, this.hits[`card${i}`])) ||
      this._hit(p, this.hits.friends) || this._hit(p, this.hits.login) || this._hit(p, this.hits.admin);
    this.canvas.style.cursor = any ? 'pointer' : 'default';
  }

  _onTouch(e) { this._onDown(e); }

  _onDown(e) {
    const p = this._pos(e);
    // Game cards
    GAMES.forEach((g, i) => {
      if (this._hit(p, this.hits[`card${i}`])) {
        this.onSelectGame(g.id);
      }
    });
    // Friends
    if (this._hit(p, this.hits.friends)) {
      if (!this.user) { this._showAuthOverlay(); return; }
      this._openFriends();
    }
    // Login/Profile
    if (this._hit(p, this.hits.login)) {
      if (this.user) {
        supabase.auth.signOut();
        this.user = null; this.profile = null;
      } else {
        this._showAuthOverlay();
      }
    }
    // Admin
    if (this._hit(p, this.hits.admin)) this.onSelectGame('admin');
  }

  _openFriends() {
    if (this._friendsPanel) { this._friendsPanel.destroy(); this._friendsPanel = null; }
    this._friendsPanel = new FriendsPanel({
      user: this.user, profile: this.profile,
      onClose: () => { this._friendsPanel.destroy(); this._friendsPanel = null; },
      onStartDuel: (gameData, isHost) => {
        this.onSelectGame('higher-lower', { duel: gameData, isHost });
      },
    });
  }

  // ── Loop ───────────────────────────────────────────────────────────────────
  _loop() {
    if (this._dead) return;
    this._raf = requestAnimationFrame(() => this._loop());
    this._time += 0.016;
    this.particles.update();
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this._draw();
  }

  // ── Draw ───────────────────────────────────────────────────────────────────
  _draw() {
    const { ctx, W, H, anim } = this;
    const mobile = W < 600;
    const cx = W / 2;

    // BG
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    this.particles.draw(ctx, W, H);

    // Vignette
    const vig = ctx.createRadialGradient(cx, H/2, H * 0.2, cx, H/2, H * 0.9);
    vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);

    // ── Title ──
    ctx.save();
    ctx.globalAlpha = anim.titleA;
    ctx.translate(0, anim.titleY);
    const titleY = mobile ? 55 : 75;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

    // Smooth floating motion
    const floatY = Math.sin(this._time * 1.2) * 4;
    const floatScale = 1 + Math.sin(this._time * 0.8) * 0.015;

    // Glow that breathes
    const glowA = 0.6 + Math.sin(this._time * 1.5) * 0.4;
    ctx.shadowColor = '#00e5ff'; ctx.shadowBlur = 25 * anim.titleGlow * glowA;

    // Big title with smooth multi-stop gradient
    const tfz = mobile ? 48 : 72;
    ctx.save();
    ctx.translate(cx, titleY + floatY);
    ctx.scale(floatScale, floatScale);
    ctx.font = `900 ${tfz}px Inter, system-ui, sans-serif`;
    const tg = ctx.createLinearGradient(-280, 0, 280, 0);
    const t = this._time * 0.6;
    const s1 = (Math.sin(t) + 1) / 2;
    const s2 = (Math.sin(t + 1.5) + 1) / 2;
    tg.addColorStop(0, '#006064');
    tg.addColorStop(s1 * 0.4, '#00bcd4');
    tg.addColorStop(0.5, '#e0f7fa');
    tg.addColorStop(0.5 + s2 * 0.4, '#00bcd4');
    tg.addColorStop(1, '#006064');
    ctx.fillStyle = tg;
    ctx.fillText('QUIZOVNÍK', 0, 0);
    ctx.restore();
    ctx.shadowBlur = 0;

    // Subtitle
    ctx.font = `500 ${mobile ? 11 : 14}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = C.muted;
    ctx.fillText('Vyber si hru a začni hrať', cx, titleY + floatY + (mobile ? 32 : 42));
    ctx.restore();

    // ── Game Cards ──
    ctx.save();
    ctx.globalAlpha = anim.cardsA;
    ctx.translate(0, anim.cardsY);

    if (mobile) {
      // Mobile: stacked vertically
      const CW = Math.min(W - 30, 340);
      const CH = 100;
      const startY = titleY + 65;
      const gap = 14;
      GAMES.forEach((g, i) => {
        this._drawGameCard(cx, startY + i * (CH + gap) + CH/2, CW, CH, g, i);
      });
    } else {
      // Desktop: side by side
      const CW = 250;
      const CH = 280;
      const totalW = GAMES.length * CW + (GAMES.length - 1) * 24;
      const startX = cx - totalW / 2 + CW / 2;
      const cardY = H * 0.42;
      GAMES.forEach((g, i) => {
        this._drawGameCard(startX + i * (CW + 24), cardY, CW, CH, g, i);
      });
    }
    ctx.restore();

    // ── Bottom bar: Friends + Profile ──
    ctx.save();
    ctx.globalAlpha = anim.profileA;
    const barY = mobile ? H - 70 : H - 80;

    // Friends button
    const fbw = mobile ? 120 : 150, fbh = mobile ? 40 : 44;
    const fbx = cx - fbw - 10;
    const fb = { x: fbx, y: barY, w: fbw, h: fbh };
    this.hits.friends = fb;
    rr(ctx, fbx, barY, fbw, fbh, 14);
    ctx.fillStyle = anim.friendsH ? '#1a1a1a' : '#111';
    ctx.fill();
    rr(ctx, fbx, barY, fbw, fbh, 14);
    ctx.strokeStyle = anim.friendsH ? hex2rgba(C.gold, 0.4) : 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1; ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `700 ${mobile ? 12 : 14}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = C.goldL;
    ctx.fillText('👥 Priatelia', fbx + fbw/2, barY + fbh/2);

    // Login / Profile button
    const lbw = mobile ? 120 : 150;
    const lbx = cx + 10;
    const lb = { x: lbx, y: barY, w: lbw, h: fbh };
    this.hits.login = lb;
    rr(ctx, lbx, barY, lbw, fbh, 14);
    ctx.fillStyle = anim.loginH ? '#1a1a1a' : '#111';
    ctx.fill();
    rr(ctx, lbx, barY, lbw, fbh, 14);
    ctx.strokeStyle = anim.loginH ? hex2rgba(C.gold, 0.4) : 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1; ctx.stroke();

    ctx.font = `700 ${mobile ? 12 : 14}px Inter, system-ui, sans-serif`;
    if (this.user && this.profile) {
      ctx.fillStyle = C.text;
      ctx.fillText(`👤 ${this.profile.username || 'Profil'}`, lbx + lbw/2, barY + fbh/2);
    } else if (this.user) {
      ctx.fillStyle = C.muted;
      ctx.fillText('👤 Prihlásený', lbx + lbw/2, barY + fbh/2);
    } else {
      ctx.fillStyle = C.goldL;
      ctx.fillText('🔑 Prihlásiť sa', lbx + lbw/2, barY + fbh/2);
    }
    ctx.restore();

    // Admin button (always visible, drawn outside profileA opacity scope)
    const abw = mobile ? 80 : 100, abh = mobile ? 30 : 34;
    const abx = mobile ? W - abw - 8 : W - abw - 16;
    const aby = mobile ? 8 : 16;
    this.hits.admin = { x: abx, y: aby, w: abw, h: abh };
    ctx.save();
    rr(ctx, abx, aby, abw, abh, 10);
    ctx.fillStyle = anim.adminH ? 'rgba(168,85,247,0.2)' : 'rgba(168,85,247,0.08)'; ctx.fill();
    rr(ctx, abx, aby, abw, abh, 10);
    ctx.strokeStyle = anim.adminH ? '#a855f7' : 'rgba(168,85,247,0.35)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.font = `600 ${mobile ? 11 : 12}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = anim.adminH ? '#c084fc' : '#8b5cf6';
    ctx.fillText('⚙️ Admin', abx + abw/2, aby + abh/2);
    ctx.restore();
  }

  // ── Game Card ──────────────────────────────────────────────────────────────
  _drawGameCard(cx, cy, CW, CH, game, index) {
    const { ctx, W } = this;
    const mobile = W < 600;
    const hover = this.anim.cardHover[index] || 0;
    const CR = mobile ? 16 : 20;
    const x = cx - CW/2, y = cy - CH/2;

    const hitArea = { x, y, w: CW, h: CH };
    this.hits[`card${index}`] = hitArea;

    ctx.save();

    // Hover glow
    if (hover > 0.01) {
      ctx.shadowColor = game.color; ctx.shadowBlur = 25 * hover;
    }

    // BG
    rr(ctx, x, y, CW, CH, CR);
    const bg = ctx.createLinearGradient(x, y, x, y + CH);
    bg.addColorStop(0, hover > 0.5 ? '#1a1a1a' : '#111');
    bg.addColorStop(1, '#0a0a0a');
    ctx.fillStyle = bg; ctx.fill();
    ctx.shadowBlur = 0;

    // Border
    rr(ctx, x, y, CW, CH, CR);
    const borderA = 0.08 + hover * 0.35;
    ctx.strokeStyle = hex2rgba(game.color, borderA);
    ctx.lineWidth = 1.5; ctx.stroke();

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

    if (mobile) {
      // Mobile: horizontal card
      ctx.font = '28px serif';
      ctx.fillText(game.emoji, x + 40, cy);

      ctx.font = `800 ${game.title.length > 16 ? 14 : 16}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = C.text;
      ctx.fillText(game.title, cx + 15, cy - 12);

      ctx.font = '500 11px Inter, system-ui, sans-serif';
      ctx.fillStyle = C.muted;
      ctx.fillText(game.desc, cx + 15, cy + 12);

      // Arrow
      ctx.font = '700 18px Inter, system-ui, sans-serif';
      ctx.fillStyle = hex2rgba(game.color, 0.4 + hover * 0.6);
      ctx.fillText('›', x + CW - 25, cy);
    } else {
      // Desktop: vertical card
      ctx.font = '48px serif';
      ctx.fillText(game.emoji, cx, y + 70);

      ctx.font = `800 ${game.title.length > 16 ? 17 : 20}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = C.text;
      ctx.fillText(game.title, cx, y + 130);

      ctx.font = '500 13px Inter, system-ui, sans-serif';
      ctx.fillStyle = C.muted;
      ctx.fillText(game.desc, cx, y + 160);

      // Play indicator
      const playY = y + CH - 50;
      const playW = 120, playH = 36;
      rr(ctx, cx - playW/2, playY, playW, playH, 12);
      const pbg = ctx.createLinearGradient(cx - playW/2, playY, cx + playW/2, playY);
      pbg.addColorStop(0, hex2rgba(game.color, 0.15 + hover * 0.25));
      pbg.addColorStop(1, hex2rgba(game.color, 0.05 + hover * 0.15));
      ctx.fillStyle = pbg; ctx.fill();
      rr(ctx, cx - playW/2, playY, playW, playH, 12);
      ctx.strokeStyle = hex2rgba(game.color, 0.2 + hover * 0.3);
      ctx.lineWidth = 1; ctx.stroke();
      ctx.font = '700 13px Inter, system-ui, sans-serif';
      ctx.fillStyle = hex2rgba(game.color, 0.6 + hover * 0.4);
      ctx.fillText('HRAŤ ▶', cx, playY + playH/2);
    }

    ctx.restore();
  }

  // ── Auth Overlay (HTML) ──────────────────────────────────────────────────
  _createHTMLOverlay() {
    this._overlay = document.createElement('div');
    this._overlay.id = 'auth-overlay';
    Object.assign(this._overlay.style, {
      position: 'fixed', inset: 0, display: 'none', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.85)', zIndex: 100, fontFamily: 'Inter, system-ui, sans-serif',
    });
    this._overlay.innerHTML = `
      <div id="auth-box" style="background:#111;border:1px solid #222;border-radius:24px;padding:32px;width:min(380px,90vw);text-align:center;">
        <h2 id="auth-title" style="color:#fbbf24;margin:0 0 20px;font-size:22px;">Prihlásiť sa</h2>
        <div id="auth-error" style="color:#ef4444;font-size:13px;margin-bottom:12px;display:none;"></div>
        <input id="auth-email" placeholder="E-mail" style="width:100%;padding:12px 16px;border:1px solid #333;background:#0a0a0a;color:#fff;border-radius:12px;font-size:15px;margin-bottom:10px;box-sizing:border-box;font-family:Inter,system-ui,sans-serif;" />
        <input id="auth-pass" type="password" placeholder="Heslo" style="width:100%;padding:12px 16px;border:1px solid #333;background:#0a0a0a;color:#fff;border-radius:12px;font-size:15px;margin-bottom:10px;box-sizing:border-box;font-family:Inter,system-ui,sans-serif;" />
        <input id="auth-user" placeholder="Prezývka" style="width:100%;padding:12px 16px;border:1px solid #333;background:#0a0a0a;color:#fff;border-radius:12px;font-size:15px;margin-bottom:16px;box-sizing:border-box;display:none;font-family:Inter,system-ui,sans-serif;" />
        <button id="auth-submit" style="width:100%;padding:14px;background:linear-gradient(135deg,#f59e0b,#d97706);color:#000;font-weight:800;border:none;border-radius:14px;font-size:16px;cursor:pointer;font-family:Inter,system-ui,sans-serif;">Prihlásiť sa</button>
        <p id="auth-switch" style="color:#737373;font-size:13px;margin-top:14px;cursor:pointer;">Nemáš účet? <span style="color:#fbbf24;font-weight:600;">Registrovať sa</span></p>
        <p id="auth-close" style="color:#555;font-size:12px;margin-top:10px;cursor:pointer;">Zavrieť</p>
      </div>
    `;
    document.body.appendChild(this._overlay);

    this._inputs = {
      email: this._overlay.querySelector('#auth-email'),
      pass: this._overlay.querySelector('#auth-pass'),
      user: this._overlay.querySelector('#auth-user'),
    };
    this._overlay.querySelector('#auth-submit').onclick = () => this._submitAuth();
    this._overlay.querySelector('#auth-switch').onclick = () => this._toggleAuthMode();
    this._overlay.querySelector('#auth-close').onclick = () => this._hideAuthOverlay();
  }

  _showAuthOverlay() {
    this._overlay.style.display = 'flex';
    this.authMode = 'login';
    this._updateAuthUI();
  }

  _hideAuthOverlay() {
    this._overlay.style.display = 'none';
    this.authError = '';
  }

  _toggleAuthMode() {
    this.authMode = this.authMode === 'login' ? 'register' : 'login';
    this._updateAuthUI();
  }

  _updateAuthUI() {
    const isReg = this.authMode === 'register';
    this._overlay.querySelector('#auth-title').textContent = isReg ? 'Registrácia' : 'Prihlásiť sa';
    this._overlay.querySelector('#auth-submit').textContent = isReg ? 'Registrovať sa' : 'Prihlásiť sa';
    this._overlay.querySelector('#auth-switch').innerHTML = isReg
      ? 'Máš účet? <span style="color:#fbbf24;font-weight:600;">Prihlásiť sa</span>'
      : 'Nemáš účet? <span style="color:#fbbf24;font-weight:600;">Registrovať sa</span>';
    this._inputs.user.style.display = isReg ? 'block' : 'none';
    const errEl = this._overlay.querySelector('#auth-error');
    errEl.style.display = 'none'; errEl.textContent = '';
  }

  async _submitAuth() {
    const email = this._inputs.email.value.trim();
    const pass = this._inputs.pass.value.trim();
    if (!email || !pass) return;

    const errEl = this._overlay.querySelector('#auth-error');
    errEl.style.display = 'none';

    if (this.authMode === 'register') {
      const username = this._inputs.user.value.trim();
      if (!username) { errEl.textContent = 'Zadaj prezývku'; errEl.style.display = 'block'; return; }
      const { data, error } = await supabase.auth.signUp({ email, password: pass });
      if (error) { errEl.textContent = error.message; errEl.style.display = 'block'; return; }
      if (data.user) {
        await supabase.from('profiles').upsert({ id: data.user.id, username, email });
        this.user = data.user;
        this._fetchProfile();
        this._hideAuthOverlay();
      }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
      if (error) { errEl.textContent = error.message; errEl.style.display = 'block'; return; }
      if (data.user) {
        this.user = data.user;
        this._fetchProfile();
        this._hideAuthOverlay();
      }
    }
  }

  _removeHTMLOverlay() {
    if (this._overlay?.parentNode) this._overlay.remove();
  }
}
