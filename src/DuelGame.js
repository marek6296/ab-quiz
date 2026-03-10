import { supabase } from './lib/supabase';
import { getRandomGameSequence } from './higher-lower/hlDataset';
import gsap from 'gsap';

// ─── PALETTE (matches HigherLowerGame) ──────────────────────────────────────
const C = {
  bg: '#050505', gold: '#f59e0b', goldL: '#fbbf24', goldD: '#d97706',
  green: '#22c55e', greenL: '#4ade80', red: '#ef4444', redL: '#f87171',
  purple: '#a855f7', text: '#ffffff', muted: '#737373', dim: '#404040',
};

function hex2rgba(hex, a) {
  const [r, g, b] = [1,3,5].map(i => parseInt(hex.slice(i, i+2), 16));
  return `rgba(${r},${g},${b},${a})`;
}
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
  const words = text.split(' '); let line = '', lines = [];
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  const top = y - (lines.length * lineH) / 2 + lineH / 2;
  lines.forEach((l, i) => ctx.fillText(l, cx, top + i * lineH));
}
function formatNum(n) { return Number(n).toLocaleString('sk-SK'); }
function lerp(a, b, t) { return a + (b - a) * t; }

const ROUND_TIME = 10; // seconds per round
const TOTAL_ROUNDS = 10;

/**
 * DuelGame – manages a 1v1 Higher or Lower match on the same canvas.
 * Both players share the same sequence (stored in game.state.sequence).
 * Communication is via Supabase Realtime on higher_lower_games + higher_lower_players.
 */
export class DuelGame {
  constructor({ canvas, user, profile, game, isHost, onEnd }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = window.devicePixelRatio || 1;
    this.user = user;
    this.profile = profile;
    this.game = game; // DB row from higher_lower_games
    this.isHost = isHost;
    this.onEnd = onEnd; // callback when duel ends

    this.W = 0; this.H = 0;
    this._dead = false;

    // Game state
    this.phase = 'waiting'; // waiting | countdown | round | reveal | result
    this.round = 0; // 0-indexed, 0..9
    this.myScore = 0;
    this.oppScore = 0;
    this.myAnswer = null;   // 'higher' | 'lower' | null
    this.oppAnswer = null;
    this.myAnswerTime = null;
    this.oppAnswerTime = null;
    this.sequence = [];
    this.topic = '';
    this.metric = '';
    this.countdownNum = 3;
    this.timer = ROUND_TIME;
    this._timerInterval = null;

    // Player info
    this.myName = profile?.username || user?.email?.split('@')[0] || 'Ty';
    this.oppName = '...';
    this.myPlayerId = null;
    this.oppPlayerId = null;

    // Anim
    this.anim = {
      leftA: 0, rightA: 0, leftX: 0, rightX: 0,
      valReveal: 0, timerPulse: 0,
      countdownScale: 0, resultA: 0,
      bhH: 0, blH: 0,
    };
    this.hits = {};
    this._time = 0;

    // Count-up
    this.countUp = { current: 0, target: 0, active: false };

    this._resize = this._resize.bind(this);
    this._onMove = this._onMove.bind(this);
    this._onClick = this._onClick.bind(this);
    window.addEventListener('resize', this._resize);
    canvas.addEventListener('mousemove', this._onMove);
    canvas.addEventListener('mousedown', this._onClick);
    canvas.addEventListener('touchstart', (e) => this._onClick(e), { passive: true });
    this._resize();

    this._init();
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  async _init() {
    // If host, generate sequence and store it
    if (this.isHost) {
      const data = await getRandomGameSequence(TOTAL_ROUNDS + 1);
      this.sequence = data.sequence;
      this.topic = data.topic;
      this.metric = data.metric;

      // Store sequence in game state
      await supabase.from('higher_lower_games').update({
        state: {
          sequence: this.sequence.map(s => ({ name: s.name, value: s.value, image: s.image })),
          topic: this.topic, metric: this.metric, round: 0,
        },
        status: 'waiting',
      }).eq('id', this.game.id);

      // Add self as player
      const { data: myP } = await supabase.from('higher_lower_players').insert({
        game_id: this.game.id, user_id: this.user.id,
        player_name: this.myName, score: 0,
      }).select().single();
      this.myPlayerId = myP?.id;
    } else {
      // Joiner: fetch game state
      const { data: g } = await supabase.from('higher_lower_games')
        .select('*').eq('id', this.game.id).single();
      if (g?.state?.sequence) {
        this.sequence = g.state.sequence;
        this.topic = g.state.topic || '';
        this.metric = g.state.metric || '';
      }

      // Add self as player
      const { data: myP } = await supabase.from('higher_lower_players').insert({
        game_id: this.game.id, user_id: this.user.id,
        player_name: this.myName, score: 0,
      }).select().single();
      this.myPlayerId = myP?.id;

      // Signal: game is now playing
      await supabase.from('higher_lower_games').update({
        status: 'playing',
      }).eq('id', this.game.id);
    }

    this._subscribeRealtime();
    this._loop();

    // If already 2 players, start countdown
    await this._checkPlayers();
  }

  async _checkPlayers() {
    const { data: players } = await supabase.from('higher_lower_players')
      .select('*').eq('game_id', this.game.id);
    if (players && players.length >= 2) {
      const opp = players.find(p => p.user_id !== this.user.id);
      if (opp) {
        this.oppName = opp.player_name || 'Súper';
        this.oppPlayerId = opp.id;
      }
      if (this.phase === 'waiting') this._startCountdown();
    }
  }

  // ── Realtime ──────────────────────────────────────────────────────────────
  _subscribeRealtime() {
    // Listen for game status changes (player joined, game updates)
    this._gameCh = supabase.channel(`duel-game-${this.game.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'higher_lower_games',
        filter: `id=eq.${this.game.id}`,
      }, (payload) => {
        const g = payload.new;
        if (g.status === 'playing' && this.phase === 'waiting') {
          this._checkPlayers();
        }
        if (g.status === 'abandoned') {
          this._oppLeft();
        }
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'higher_lower_players',
        filter: `game_id=eq.${this.game.id}`,
      }, (payload) => {
        const p = payload.new;
        if (!p || p.user_id === this.user.id) return;
        // Opponent joined
        if (payload.eventType === 'INSERT') {
          this.oppName = p.player_name || 'Súper';
          this.oppPlayerId = p.id;
          if (this.phase === 'waiting') this._checkPlayers();
        }
        // Opponent answered
        if (payload.eventType === 'UPDATE' && p.last_answer && this.phase === 'round') {
          this.oppAnswer = p.last_answer;
          this.oppAnswerTime = p.answer_time;
          this.oppScore = p.score || 0;
          // If both answered, reveal
          if (this.myAnswer) this._doReveal();
        }
      })
      .subscribe();
  }

  // ── Phases ────────────────────────────────────────────────────────────────
  _startCountdown() {
    this.phase = 'countdown';
    this.countdownNum = 3;
    const tick = () => {
      if (this._dead) return;
      this.anim.countdownScale = 0;
      gsap.fromTo(this.anim, { countdownScale: 2 }, { countdownScale: 1, duration: 0.5, ease: 'back.out(2)' });
      if (this.countdownNum <= 0) {
        this._startRound();
        return;
      }
      setTimeout(() => { this.countdownNum--; tick(); }, 1000);
    };
    tick();
  }

  _startRound() {
    this.phase = 'round';
    this.myAnswer = null;
    this.oppAnswer = null;
    this.myAnswerTime = null;
    this.oppAnswerTime = null;
    this.timer = ROUND_TIME;
    this.anim.valReveal = 0;
    this.countUp = { current: 0, target: 0, active: false };

    // Reset last_answer for this round
    if (this.myPlayerId) {
      supabase.from('higher_lower_players').update({
        last_answer: null, answer_time: null,
      }).eq('id', this.myPlayerId).then();
    }

    // Animate cards in
    this.anim.leftX = -400; this.anim.leftA = 0;
    this.anim.rightX = 400; this.anim.rightA = 0;
    gsap.to(this.anim, { leftX: 0, leftA: 1, duration: 0.5, ease: 'back.out(1.4)', delay: 0.2 });
    gsap.to(this.anim, { rightX: 0, rightA: 1, duration: 0.5, ease: 'back.out(1.4)', delay: 0.35 });

    // Start timer
    clearInterval(this._timerInterval);
    this._timerInterval = setInterval(() => {
      if (this._dead || this.phase !== 'round') return;
      this.timer -= 0.1;
      if (this.timer <= 3 && this.timer > 0) {
        this.anim.timerPulse = 1;
        gsap.to(this.anim, { timerPulse: 0, duration: 0.3 });
      }
      if (this.timer <= 0) {
        this.timer = 0;
        clearInterval(this._timerInterval);
        // Time's up - if no answer, count as wrong
        this._doReveal();
      }
    }, 100);
  }

  async _submitAnswer(answer) {
    if (this.phase !== 'round' || this.myAnswer) return;
    this.myAnswer = answer;
    this.myAnswerTime = new Date().toISOString();

    // Check correctness
    const L = this.sequence[this.round];
    const R = this.sequence[this.round + 1];
    const isHigher = Number(R.value) >= Number(L.value);
    const correct = (answer === 'higher' && isHigher) || (answer === 'lower' && !isHigher);
    if (correct) this.myScore++;

    // Save to DB
    await supabase.from('higher_lower_players').update({
      last_answer: answer, answer_time: this.myAnswerTime, score: this.myScore,
    }).eq('id', this.myPlayerId);

    // If opponent already answered, reveal
    if (this.oppAnswer) this._doReveal();
  }

  _doReveal() {
    if (this.phase === 'reveal' || this.phase === 'result') return;
    clearInterval(this._timerInterval);
    this.phase = 'reveal';

    // Count-up the value
    const R = this.sequence[this.round + 1];
    this.countUp = { current: 0, target: Number(R.value), active: true };
    gsap.to(this.anim, { valReveal: 1, duration: 0.6 });

    // After 3s, next round or result
    setTimeout(() => {
      if (this._dead) return;
      this.round++;
      if (this.round >= TOTAL_ROUNDS) {
        this._showResult();
      } else {
        this._startRound();
      }
    }, 3000);
  }

  _showResult() {
    this.phase = 'result';
    gsap.fromTo(this.anim, { resultA: 0 }, { resultA: 1, duration: 0.6, ease: 'power2.out' });

    // Update game as finished
    supabase.from('higher_lower_games').update({
      status: 'finished',
      state: {
        ...(this.game.state || {}),
        final_scores: { my: this.myScore, opp: this.oppScore },
      },
    }).eq('id', this.game.id).then();
  }

  _oppLeft() {
    if (this.phase === 'result') return;
    this.phase = 'result';
    this.oppName += ' (odišiel)';
    gsap.fromTo(this.anim, { resultA: 0 }, { resultA: 1, duration: 0.6 });
  }

  // ── Input ─────────────────────────────────────────────────────────────────
  _pos(e) {
    const r = this.canvas.getBoundingClientRect();
    if (e.touches) return { x: e.touches[0].clientX - r.left, y: e.touches[0].clientY - r.top };
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  _hit(p, a) { return a && p.x >= a.x && p.x <= a.x + a.w && p.y >= a.y && p.y <= a.y + a.h; }

  _onMove(e) {
    const p = this._pos(e);
    gsap.to(this.anim, { bhH: this._hit(p, this.hits.bh) ? 1 : 0, duration: 0.15 });
    gsap.to(this.anim, { blH: this._hit(p, this.hits.bl) ? 1 : 0, duration: 0.15 });
    const any = this._hit(p, this.hits.bh) || this._hit(p, this.hits.bl) || this._hit(p, this.hits.back);
    this.canvas.style.cursor = any ? 'pointer' : 'default';
  }

  _onClick(e) {
    const p = this._pos(e);
    if (this.phase === 'round') {
      if (this._hit(p, this.hits.bh)) this._submitAnswer('higher');
      if (this._hit(p, this.hits.bl)) this._submitAnswer('lower');
    }
    if (this.phase === 'result') {
      if (this._hit(p, this.hits.back)) this._exit();
    }
  }

  _exit() {
    this.destroy();
    if (this.onEnd) this.onEnd();
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
    requestAnimationFrame(() => this._loop());
    this._time += 0.016;
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

  destroy() {
    this._dead = true;
    clearInterval(this._timerInterval);
    if (this._gameCh) this._gameCh.unsubscribe();
    window.removeEventListener('resize', this._resize);
    this.canvas.removeEventListener('mousemove', this._onMove);
    this.canvas.removeEventListener('mousedown', this._onClick);
    gsap.killTweensOf(this.anim);
  }

  // ── Drawing ───────────────────────────────────────────────────────────────
  _draw() {
    const { ctx, W, H } = this;
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);

    if (this.phase === 'waiting') this._drawWaiting();
    else if (this.phase === 'countdown') this._drawCountdown();
    else if (this.phase === 'round' || this.phase === 'reveal') this._drawRound();
    else if (this.phase === 'result') this._drawResult();
  }

  // ── WAITING ───────────────────────────────────────────────────────────────
  _drawWaiting() {
    const { ctx, W, H } = this;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '900 28px Inter, system-ui, sans-serif';
    ctx.fillStyle = C.gold;
    ctx.fillText('⚔️ Čakám na súpera...', W/2, H/2 - 20);
    ctx.font = '500 16px Inter, system-ui, sans-serif';
    ctx.fillStyle = C.muted;
    const dots = '.'.repeat(Math.floor(this._time * 2) % 4);
    ctx.fillText(`Pripája sa${dots}`, W/2, H/2 + 20);
  }

  // ── COUNTDOWN ─────────────────────────────────────────────────────────────
  _drawCountdown() {
    const { ctx, W, H, anim } = this;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

    // Scoreboard
    this._drawScoreboard();

    ctx.save();
    ctx.translate(W/2, H/2);
    ctx.scale(anim.countdownScale, anim.countdownScale);
    ctx.font = '900 120px Inter, system-ui, sans-serif';
    ctx.fillStyle = C.gold;
    ctx.shadowColor = C.gold; ctx.shadowBlur = 30;
    ctx.fillText(this.countdownNum > 0 ? `${this.countdownNum}` : 'GO!', 0, 0);
    ctx.restore();
  }

  // ── ROUND / REVEAL ────────────────────────────────────────────────────────
  _drawRound() {
    const { ctx, W, H, anim } = this;
    const cx = W / 2;
    const mobile = W < 600;

    // Scoreboard at top
    this._drawScoreboard();

    // Header area below scoreboard
    const headerY = 58;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `700 ${mobile ? 12 : 14}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = C.muted;
    ctx.fillText(`Kolo ${this.round + 1} / ${TOTAL_ROUNDS}`, cx, headerY);

    // Topic (below round text)
    ctx.font = `500 ${mobile ? 10 : 12}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = C.dim;
    ctx.fillText(this.topic, cx, headerY + 18);

    // Timer bar (below topic)
    this._drawTimer(cx, headerY + 36);

    // Cards
    const L = this.sequence[this.round];
    const R = this.sequence[this.round + 1];
    if (!L || !R) return;

    if (mobile) {
      // Mobile: stacked vertically, smaller cards
      const CW = Math.min(W - 30, 280);
      const CH = 160;
      const topStart = headerY + 65;
      this._drawCard(cx + anim.leftX, topStart + CH / 2 + 5, L, true, anim.leftA, CW, CH);
      this._drawCard(cx + anim.rightX, topStart + CH + CH / 2 + 20, R, false, anim.rightA, CW, CH);

      // Answers overlay during reveal
      if (this.phase === 'reveal') {
        this._drawAnswers(cx, topStart + CH * 2 + 50);
      }
    } else {
      // Desktop: side by side
      const cy = H / 2 + 30;
      const gapX = Math.min(220, W * 0.16);
      this._drawCard(cx - gapX + anim.leftX, cy, L, true, anim.leftA, 290, 320);
      this._drawCard(cx + gapX + anim.rightX, cy, R, false, anim.rightA, 290, 320);

      if (this.phase === 'reveal') {
        this._drawAnswers(cx, cy);
      }
    }
  }

  _drawScoreboard() {
    const { ctx, W } = this;
    const mobile = W < 600;
    const y = mobile ? 18 : 26;
    const nameFz = mobile ? 13 : 16;
    const scoreFz = mobile ? 18 : 22;
    ctx.textBaseline = 'middle';

    // Truncate names on mobile
    const myDisplay = mobile ? this.myName.slice(0, 8) : this.myName;
    const oppDisplay = mobile ? this.oppName.slice(0, 8) : this.oppName;

    // My side (left)
    ctx.textAlign = 'right';
    ctx.font = `700 ${nameFz}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = C.goldL;
    ctx.fillText(myDisplay, W/2 - 45, y);
    ctx.font = `900 ${scoreFz}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.fillText(`${this.myScore}`, W/2 - 18, y);

    // VS
    ctx.textAlign = 'center';
    ctx.font = `700 ${mobile ? 11 : 14}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = C.dim;
    ctx.fillText('vs', W/2, y);

    // Opponent (right)
    ctx.textAlign = 'left';
    ctx.font = `900 ${scoreFz}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.fillText(`${this.oppScore}`, W/2 + 18, y);
    ctx.font = `700 ${nameFz}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = C.purple;
    ctx.fillText(oppDisplay, W/2 + 45, y);
  }

  _drawTimer(cx, y) {
    const { ctx, W } = this;
    const mobile = W < 600;
    const w = mobile ? Math.min(W - 60, 180) : 200;
    const h = 5;
    const pct = Math.max(0, this.timer / ROUND_TIME);

    // BG
    rr(ctx, cx - w/2, y, w, h, 3);
    ctx.fillStyle = '#222'; ctx.fill();

    // Fill
    const fillW = Math.max(0, w * pct);
    if (fillW > 0) {
      rr(ctx, cx - w/2, y, fillW, h, 3);
      ctx.fillStyle = pct > 0.3 ? C.gold : C.red; ctx.fill();
    }

    // Timer text
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const tFz = this.anim.timerPulse ? (mobile ? 13 : 16) : (mobile ? 11 : 13);
    ctx.font = `700 ${tFz}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = pct > 0.3 ? C.muted : C.red;
    ctx.fillText(`${Math.ceil(this.timer)}s`, cx, y + (mobile ? 16 : 20));
  }

  _drawCard(cx, cy, item, revealed, alpha, CW, CH) {
    const { ctx, W } = this;
    const mobile = W < 600;
    const CR = mobile ? 14 : 18;
    const x = cx - CW / 2, y = cy - CH / 2;

    ctx.save();
    ctx.globalAlpha = alpha;

    // Shadow + bg
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = mobile ? 12 : 25; ctx.shadowOffsetY = mobile ? 4 : 8;
    rr(ctx, x, y, CW, CH, CR);
    const bg = ctx.createLinearGradient(x, y, x, y + CH);
    bg.addColorStop(0, '#151515'); bg.addColorStop(1, '#0a0a0a');
    ctx.fillStyle = bg; ctx.fill();
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

    // Border
    rr(ctx, x, y, CW, CH, CR);
    ctx.strokeStyle = revealed ? hex2rgba(C.gold, 0.3) : 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1.5; ctx.stroke();

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

    if (mobile) {
      // Mobile compact layout: emoji left, name+value right, buttons bottom
      const emojiFz = 32;
      const nameFz = item.name.length > 18 ? 13 : 16;

      // Emoji
      ctx.font = `${emojiFz}px serif`;
      ctx.fillText(item.image || '❓', x + 40, cy - 10);

      // Name
      ctx.font = `700 ${nameFz}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = '#fff';
      wrapText(ctx, item.name, cx + 15, cy - 15, CW - 90, 20);

      // Value
      if (revealed) {
        ctx.font = '900 14px Inter, system-ui, sans-serif';
        ctx.fillStyle = C.gold;
        ctx.fillText(`${formatNum(item.value)} ${this.metric}`, cx + 15, cy + 15);
      } else {
        // Revealed value (count-up)
        if (this.anim.valReveal > 0.01) {
          ctx.save();
          ctx.globalAlpha = this.anim.valReveal;
          ctx.font = '900 14px Inter, system-ui, sans-serif';
          ctx.fillStyle = C.gold;
          ctx.fillText(`${formatNum(Math.round(this.countUp.current))} ${this.metric}`, cx + 15, cy + 15);
          ctx.restore();
        }

        // Buttons
        const btnAlpha = 1 - Math.min(1, this.anim.valReveal * 2.5);
        if (btnAlpha > 0.01 && !this.myAnswer) {
          ctx.save();
          ctx.globalAlpha *= btnAlpha;
          const bw = (CW - 20) / 2 - 4, bh = 34;
          const by = y + CH - bh - 8;

          // Higher
          const bha = { x: x + 6, y: by, w: bw, h: bh };
          this.hits.bh = bha;
          rr(ctx, bha.x, bha.y, bw, bh, 10);
          ctx.fillStyle = this.anim.bhH ? C.greenL : C.green; ctx.fill();
          ctx.font = '800 12px Inter, system-ui, sans-serif';
          ctx.fillStyle = '#000';
          ctx.fillText('▲ HIGHER', x + 6 + bw / 2, by + bh / 2);

          // Lower
          const bla = { x: x + 6 + bw + 8, y: by, w: bw, h: bh };
          this.hits.bl = bla;
          rr(ctx, bla.x, bla.y, bw, bh, 10);
          ctx.fillStyle = this.anim.blH ? C.redL : C.red; ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.fillText('▼ LOWER', bla.x + bw / 2, by + bh / 2);
          ctx.restore();
        }

        // "Answered" indicator
        if (this.myAnswer && this.anim.valReveal < 0.01) {
          ctx.font = '700 13px Inter, system-ui, sans-serif';
          ctx.fillStyle = C.goldL;
          ctx.fillText(`Ty: ${this.myAnswer === 'higher' ? '▲' : '▼'}`, cx - 30, y + CH - 25);
          ctx.font = '500 11px Inter, system-ui, sans-serif';
          ctx.fillStyle = C.muted;
          ctx.fillText(this.oppAnswer ? '✓' : '⏳', cx + 30, y + CH - 25);
        }
      }
    } else {
      // Desktop layout: vertical card
      // Emoji
      ctx.font = '50px serif';
      ctx.fillText(item.image || '❓', cx, y + 70);

      // Name
      ctx.font = `700 ${item.name.length > 18 ? 16 : 20}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = '#fff';
      wrapText(ctx, item.name, cx, y + 145, CW - 30, 24);

      // Value
      if (revealed) {
        ctx.font = '900 18px Inter, system-ui, sans-serif';
        ctx.fillStyle = C.gold;
        ctx.fillText(`${formatNum(item.value)} ${this.metric}`, cx, y + 195);
      } else {
        if (this.anim.valReveal > 0.01) {
          ctx.save();
          ctx.globalAlpha = this.anim.valReveal;
          ctx.font = '900 18px Inter, system-ui, sans-serif';
          ctx.fillStyle = C.gold;
          ctx.fillText(`${formatNum(Math.round(this.countUp.current))} ${this.metric}`, cx, y + 195);
          ctx.restore();
        }

        const btnAlpha = 1 - Math.min(1, this.anim.valReveal * 2.5);
        if (btnAlpha > 0.01 && !this.myAnswer) {
          ctx.save();
          ctx.globalAlpha *= btnAlpha;
          const bw = 160, bh = 44, bx = cx - bw / 2;
          const by1 = y + CH - 110, by2 = y + CH - 55;

          const bha = { x: bx, y: by1 - bh/2, w: bw, h: bh };
          this.hits.bh = bha;
          ctx.shadowColor = C.green; ctx.shadowBlur = this.anim.bhH * 18;
          rr(ctx, bx, bha.y, bw, bh, 12);
          ctx.fillStyle = this.anim.bhH ? C.greenL : C.green; ctx.fill();
          ctx.shadowBlur = 0;
          ctx.font = '800 15px Inter, system-ui, sans-serif';
          ctx.fillStyle = '#000';
          ctx.fillText('▲ HIGHER', cx, by1);

          const bla = { x: bx, y: by2 - bh/2, w: bw, h: bh };
          this.hits.bl = bla;
          ctx.shadowColor = C.red; ctx.shadowBlur = this.anim.blH * 18;
          rr(ctx, bx, bla.y, bw, bh, 12);
          ctx.fillStyle = this.anim.blH ? C.redL : C.red; ctx.fill();
          ctx.shadowBlur = 0;
          ctx.fillStyle = '#fff';
          ctx.fillText('▼ LOWER', cx, by2);
          ctx.restore();
        }

        if (this.myAnswer && this.anim.valReveal < 0.01) {
          ctx.font = '700 16px Inter, system-ui, sans-serif';
          ctx.fillStyle = C.goldL;
          ctx.fillText(`Ty: ${this.myAnswer === 'higher' ? '▲ Higher' : '▼ Lower'}`, cx, y + CH - 70);
          ctx.font = '500 13px Inter, system-ui, sans-serif';
          ctx.fillStyle = C.muted;
          ctx.fillText(this.oppAnswer ? 'Súper odpovedal ✓' : 'Čakám na súpera...', cx, y + CH - 42);
        }
      }
    }

    ctx.restore();
  }

  _drawAnswers(cx, baseY) {
    const { ctx, W } = this;
    const mobile = W < 600;
    const L = this.sequence[this.round];
    const R = this.sequence[this.round + 1];
    const isHigher = Number(R.value) >= Number(L.value);

    const myCorrect = this.myAnswer && ((this.myAnswer === 'higher' && isHigher) || (this.myAnswer === 'lower' && !isHigher));
    const oppCorrect = this.oppAnswer && ((this.oppAnswer === 'higher' && isHigher) || (this.oppAnswer === 'lower' && !isHigher));

    const y = mobile ? baseY : Math.min(baseY + 200, this.H - 60);
    const fz = mobile ? 12 : 15;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `700 ${fz}px Inter, system-ui, sans-serif`;

    const spacing = mobile ? 0 : 120;

    // My answer  
    ctx.fillStyle = myCorrect ? C.green : (this.myAnswer ? C.red : C.muted);
    const myIcon = myCorrect ? '✓' : (this.myAnswer ? '✕' : '—');
    const myLabel = this.myAnswer ? (this.myAnswer === 'higher' ? 'Higher' : 'Lower') : 'Neodpovedal';
    ctx.fillText(`${myIcon} ${this.myName}: ${myLabel}`, W/2 - spacing, y);

    // Opp answer
    ctx.fillStyle = oppCorrect ? C.green : (this.oppAnswer ? C.red : C.muted);
    const oppIcon = oppCorrect ? '✓' : (this.oppAnswer ? '✕' : '—');
    const oppLabel = this.oppAnswer ? (this.oppAnswer === 'higher' ? 'Higher' : 'Lower') : 'Neodpovedal';
    ctx.fillText(`${oppIcon} ${this.oppName}: ${oppLabel}`, W/2 + spacing, mobile ? y + 18 : y);
  }

  // ── RESULT ────────────────────────────────────────────────────────────────
  _drawResult() {
    const { ctx, W, H, anim } = this;
    ctx.save();
    ctx.globalAlpha = anim.resultA;
    ctx.fillStyle = 'rgba(0,0,0,0.88)'; ctx.fillRect(0, 0, W, H);

    const cx = W / 2, cy = H / 2;
    const pw = Math.min(440, W - 40), ph = 380;
    const px = cx - pw/2, py = cy - ph/2;

    // Panel
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 40;
    rr(ctx, px, py, pw, ph, 28);
    const bg = ctx.createLinearGradient(px, py, px, py + ph);
    bg.addColorStop(0, '#151515'); bg.addColorStop(1, '#0a0a0a');
    ctx.fillStyle = bg; ctx.fill(); ctx.shadowBlur = 0;

    const won = this.myScore > this.oppScore;
    const tied = this.myScore === this.oppScore;
    const borderColor = won ? C.gold : (tied ? C.muted : C.red);
    rr(ctx, px, py, pw, ph, 28);
    ctx.strokeStyle = borderColor; ctx.lineWidth = 2; ctx.stroke();

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

    // Title
    ctx.font = '900 38px Inter, system-ui, sans-serif';
    ctx.shadowColor = borderColor; ctx.shadowBlur = 20;
    ctx.fillStyle = borderColor;
    ctx.fillText(won ? '🏆 VÝHRA!' : (tied ? '🤝 REMÍZA' : '😞 PREHRA'), cx, py + 65);
    ctx.shadowBlur = 0;

    // Scores
    ctx.font = '700 18px Inter, system-ui, sans-serif';
    ctx.fillStyle = C.goldL;
    ctx.fillText(this.myName, cx - 80, cy - 20);
    ctx.fillStyle = C.purple;
    ctx.fillText(this.oppName, cx + 80, cy - 20);

    ctx.font = '900 56px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText(`${this.myScore}`, cx - 80, cy + 35);
    ctx.fillText(`${this.oppScore}`, cx + 80, cy + 35);

    ctx.font = '700 24px Inter, system-ui, sans-serif';
    ctx.fillStyle = C.dim;
    ctx.fillText(':', cx, cy + 30);

    // Back button
    const bbw = 200, bbh = 50;
    const bb = { x: cx - bbw/2, y: py + ph - 70, w: bbw, h: bbh };
    this.hits.back = bb;
    ctx.shadowColor = C.gold; ctx.shadowBlur = 8;
    rr(ctx, bb.x, bb.y, bb.w, bb.h, 16);
    const g = ctx.createLinearGradient(bb.x, bb.y, bb.x, bb.y + bbh);
    g.addColorStop(0, C.goldL); g.addColorStop(1, C.gold);
    ctx.fillStyle = g; ctx.fill(); ctx.shadowBlur = 0;
    ctx.font = '800 17px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#000';
    ctx.fillText('🔙 Späť do menu', cx, bb.y + bbh/2);

    ctx.restore();
  }
}
