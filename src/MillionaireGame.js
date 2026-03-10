import gsap from 'gsap';
import { supabase } from './lib/supabase';
import { FriendsPanel } from './FriendsPanel';
import { MillionaireOnline } from './MillionaireOnline';

// ─── PALETTE ─────────────────────────────────────────────────────────────────
const C = {
  bg: '#050505', gold: '#f59e0b', goldL: '#fbbf24', goldD: '#d97706',
  green: '#22c55e', greenL: '#4ade80', red: '#ef4444', redL: '#f87171',
  purple: '#a855f7', purpleL: '#c084fc', blue: '#3b82f6',
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
function shuffle(arr) {
  const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a;
}

// ─── FALLBACK QUESTIONS (sorted easy→hard) ───────────────────────────────────
const FALLBACK_QS = [
  { q: 'Aké je hlavné mesto Slovenska?', answers: ['Bratislava', 'Praha', 'Budapešť', 'Viedeň'], correct: 0, difficulty: 1 },
  { q: 'Koľko farieb má dúha?', answers: ['5', '6', '7', '8'], correct: 2, difficulty: 1 },
  { q: 'Ktoré zviera štekot?', answers: ['Mačka', 'Pes', 'Krava', 'Kôň'], correct: 1, difficulty: 1 },
  { q: 'Koľko dní má týždeň?', answers: ['5', '6', '7', '8'], correct: 2, difficulty: 1 },
  { q: 'Aká je farba neba?', answers: ['Zelená', 'Modrá', 'Červená', 'Žltá'], correct: 1, difficulty: 1 },
  { q: 'Aký je najvyšší vrch sveta?', answers: ['K2', 'Everest', 'Kilimandžáro', 'Mont Blanc'], correct: 1, difficulty: 1 },
  { q: 'Koľko nôh má pavúk?', answers: ['6', '8', '10', '12'], correct: 1, difficulty: 1 },
  { q: 'Kto namaľoval Monu Lízu?', answers: ['Picasso', 'Van Gogh', 'Da Vinci', 'Michelangelo'], correct: 2, difficulty: 1 },
  { q: 'Kto napísal Hamleta?', answers: ['Goethe', 'Shakespeare', 'Dickens', 'Molière'], correct: 1, difficulty: 2 },
  { q: 'Koľko planét má Slnečná sústava?', answers: ['7', '8', '9', '10'], correct: 1, difficulty: 2 },
  { q: 'V ktorom roku padol Berlínsky múr?', answers: ['1987', '1989', '1991', '1993'], correct: 1, difficulty: 2 },
  { q: 'Aký je chemický symbol zlata?', answers: ['Ag', 'Au', 'Zn', 'Cu'], correct: 1, difficulty: 2 },
  { q: 'Koľko kostí má dospelý človek?', answers: ['206', '156', '256', '306'], correct: 0, difficulty: 2 },
  { q: 'Ktorá planéta je najbližšie k Slnku?', answers: ['Venuša', 'Merkúr', 'Mars', 'Zem'], correct: 1, difficulty: 2 },
  { q: 'Aká je najdlhšia rieka sveta?', answers: ['Amazonka', 'Níl', 'Yangtze', 'Dunaj'], correct: 1, difficulty: 3 },
  { q: 'Kto namaľoval Hviezdnu noc?', answers: ['Monet', 'Picasso', 'Van Gogh', 'Dalí'], correct: 2, difficulty: 3 },
  { q: 'Koľko chromozómov má človek?', answers: ['44', '46', '48', '50'], correct: 1, difficulty: 3 },
  { q: 'Aký je najväčší orgán človeka?', answers: ['Srdce', 'Pečeň', 'Koža', 'Mozog'], correct: 2, difficulty: 3 },
  { q: 'V ktorom roku vzniklo Československo?', answers: ['1915', '1918', '1920', '1925'], correct: 1, difficulty: 3 },
  { q: 'Aký je vzorec Einsteinovej rovnice?', answers: ['E=mc²', 'F=ma', 'a²+b²=c²', 'PV=nRT'], correct: 0, difficulty: 3 },
  { q: 'Koľko sŕdc má chobotnica?', answers: ['1', '2', '3', '4'], correct: 2, difficulty: 3 },
  { q: 'Kto zložil Deviatú symfóniu?', answers: ['Mozart', 'Bach', 'Beethoven', 'Chopin'], correct: 2, difficulty: 3 },
];

async function loadQuestions() {
  try {
    const { data, error } = await supabase.from('quiz_questions').select('*').eq('reported', false);
    if (!error && data && data.length >= 10) {
      return data.map(r => ({
        id: r.id, q: r.question,
        answers: [r.answer_a, r.answer_b, r.answer_c, r.answer_d],
        correct: r.correct_answer, difficulty: r.difficulty,
      }));
    }
  } catch(e) { console.warn('Millionaire DB load failed:', e); }
  return FALLBACK_QS;
}

const PRIZES = [
  '100 €', '200 €', '300 €', '500 €', '1 000 €', '2 000 €', '5 000 €', '10 000 €',
  '20 000 €', '50 000 €', '100 000 €', '250 000 €', '500 000 €', '1 000 000 €'
];
const TOTAL_Q = 14;
const ROUND_TIME = 20;

// ─── BOT PLAYERS ─────────────────────────────────────────────────────────────
const BOT_NAMES = ['🤖 Anna', '🤖 Peter', '🤖 Lucia'];
class BotPlayer {
  constructor(name, skill) {
    this.name = name; this.skill = skill;
    this.score = 0; this.alive = true; this.lastAnswer = null;
  }
  decide(correctIdx) {
    const correct = Math.random() < this.skill;
    const delay = 2 + Math.random() * (ROUND_TIME - 5);
    if (correct) this.lastAnswer = correctIdx;
    else { let w; do { w = Math.floor(Math.random() * 4); } while (w === correctIdx); this.lastAnswer = w; }
    return { answer: this.lastAnswer, delay };
  }
}

// ─── MILLIONAIRE GAME ────────────────────────────────────────────────────────
export class MillionaireGame {
  constructor(canvas, user, { onBack }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = window.devicePixelRatio || 1;
    this.W = 0; this.H = 0;
    this.user = user;
    this.onBack = onBack;
    this._dead = false;
    this._time = 0;

    this.phase = 'menu';
    this.round = 0;
    this.myAnswer = null;
    this.myAlive = true;
    this.timer = ROUND_TIME;
    this._timerInterval = null;
    this.questions = [];
    this.countdownNum = 3;
    this.bots = [];
    this.botCount = 3; // 1–7
    this.difficulty = null; // null = mix, 1/2/3
    this.reportedQ = new Set();
    this._transitioning = false;

    this.anim = {
      menuA: 0, menuY: 30,
      qA: 0, qY: 20,
      ansH: [0, 0, 0, 0],
      revealA: 0, resultA: 0,
      countdownScale: 0,
      playH: 0, backH: 0, exitH: 0,
      leaveH: 0, reportH: 0,
      ladderA: 0,
      botMinusH: 0, botPlusH: 0,
      diffH: [0, 0, 0],
      bfH: 0,
    };
    this.hits = {};
    this._friendsPanel = null; this._onlineGame = null; this.gameState = 'menu'; // menu|duel

    this._resize = this._resize.bind(this);
    this._onMove = this._onMove.bind(this);
    this._onClick = this._onClick.bind(this);
    window.addEventListener('resize', this._resize);
    canvas.addEventListener('mousemove', this._onMove);
    canvas.addEventListener('mousedown', this._onClick);
    canvas.addEventListener('touchstart', e => this._onClick(e), { passive: true });
    this._resize();
  }

  start() { this._animateMenu(); this._loop(); }

  destroy() {
    this._dead = true;
    clearInterval(this._timerInterval);
    window.removeEventListener('resize', this._resize);
    this.canvas.removeEventListener('mousemove', this._onMove);
    this.canvas.removeEventListener('mousedown', this._onClick);
    if (this._onlineGame) { this._onlineGame.destroy(); this._onlineGame = null; }
    if (this._friendsPanel) { this._friendsPanel.destroy(); this._friendsPanel = null; }
    gsap.killTweensOf(this.anim);
  }

  _openFriends() {
    if (this._friendsPanel || !this.user) return;
    this._friendsPanel = new FriendsPanel({
      user: this.user, profile: null, gameType: 'millionaire',
      onStartDuel: (game, isHost) => { this._friendsPanel = null; this._startOnlineDuel(game, isHost); },
      onClose: () => { this._friendsPanel = null },
    });
  }

  _startOnlineDuel(game, isHost) {
    this.gameState = 'duel';
    if (this._onlineGame) this._onlineGame.destroy();
    this._onlineGame = new MillionaireOnline({
      canvas: this.canvas, user: this.user, profile: null,
      game, isHost,
      onEnd: () => { this._onlineGame = null; this.gameState = 'menu'; this._animateMenu(); },
    });
  }

  setUser(u) { this.user = u; }

  _animateMenu() {
    this.phase = 'menu'; this.anim.menuA = 0; this.anim.menuY = 30;
    gsap.to(this.anim, { menuA: 1, menuY: 0, duration: 0.6, ease: 'back.out(1.4)', delay: 0.1 });
  }

  async _startGame() {
    if (!this.difficulty) return; // must select difficulty
    const allQ = await loadQuestions();
    let pool;
    if (this.difficulty) {
      pool = shuffle(allQ.filter(q => q.difficulty === this.difficulty));
    } else {
      const easy = shuffle(allQ.filter(q => q.difficulty === 1));
      const medium = shuffle(allQ.filter(q => q.difficulty === 2));
      const hard = shuffle(allQ.filter(q => q.difficulty === 3));
      pool = [...easy.slice(0, 5), ...medium.slice(0, 5), ...hard.slice(0, 4)];
    }
    this.questions = pool.slice(0, TOTAL_Q);
    if (this.questions.length < TOTAL_Q) {
      const used = new Set(this.questions.map(q => q.q));
      const remaining = shuffle(allQ.filter(q => !used.has(q.q)));
      this.questions.push(...remaining.slice(0, TOTAL_Q - this.questions.length));
    }
    this.round = 0; this.myAnswer = null; this.myAlive = true;
    this.reportedQ = new Set();
    this._transitioning = false;
    // Dynamic bot count with varied skills
    const allNames = ['🤖 Anna','🤖 Peter','🤖 Lucia','🤖 Tomáš','🤖 Eva','🤖 Marek','🤖 Jana'];
    const baseSkills = [0.45, 0.55, 0.62, 0.70, 0.75, 0.80, 0.85];
    this.bots = Array.from({ length: this.botCount }, (_, i) =>
      new BotPlayer(allNames[i % allNames.length], baseSkills[i % baseSkills.length])
    );
    gsap.to(this.anim, { menuA: 0, menuY: -30, duration: 0.3 });
    setTimeout(() => this._startCountdown(), 350);
  }

  _startCountdown() {
    this.phase = 'countdown'; this.countdownNum = 3;
    const tick = () => {
      if (this._dead) return;
      this.anim.countdownScale = 0;
      gsap.fromTo(this.anim, { countdownScale: 2 }, { countdownScale: 1, duration: 0.5, ease: 'back.out(2)' });
      if (this.countdownNum <= 0) { this._startRound(); return; }
      setTimeout(() => { this.countdownNum--; tick(); }, 1000);
    };
    tick();
  }

  _startRound() {
    this.phase = 'question';
    this.myAnswer = null;
    this.timer = ROUND_TIME;
    this.anim.revealA = 0;
    this._transitioning = false;
    this.anim.qA = 0; this.anim.qY = 20;
    gsap.to(this.anim, { qA: 1, qY: 0, duration: 0.5, ease: 'back.out(1.2)' });
    for (let i = 0; i < 4; i++) this.anim.ansH[i] = 0;

    const q = this.questions[this.round];
    if (!q) { this._showResult(); return; }
    this.bots.forEach(b => {
      if (!b.alive) return;
      b.lastAnswer = null;
      const { delay } = b.decide(q.correct);
      setTimeout(() => { if (!this._dead && this.phase === 'question') { /* already set in decide */ } }, delay * 1000);
    });

    clearInterval(this._timerInterval);
    this._timerInterval = setInterval(() => {
      if (this._dead || this.phase !== 'question') return;
      this.timer -= 0.1;
      if (this.timer <= 0) { this.timer = 0; clearInterval(this._timerInterval); this._doReveal(); }
    }, 100);
  }

  _submitAnswer(idx) {
    if (this.phase !== 'question' || this.myAnswer !== null || !this.myAlive) return;
    this.myAnswer = idx;
  }

  _doReveal() {
    if (this.phase !== 'question') return;
    clearInterval(this._timerInterval);
    this.phase = 'reveal';
    const q = this.questions[this.round];
    this.bots.forEach(b => {
      if (!b.alive) return;
      if (b.lastAnswer !== q.correct) b.alive = false;
      else b.score = this.round + 1;
    });
    if (this.myAlive) {
      if (this.myAnswer !== q.correct) this.myAlive = false;
    }
    gsap.to(this.anim, { revealA: 1, duration: 0.5 });

    setTimeout(() => {
      if (this._dead) return;
      this.round++;
      if (!this.myAlive) { this._showResult(); return; }
      if (this.round >= this.questions.length) { this._showResult(); return; }
      // TRANSITION: hide first, THEN spawn new round
      this._transitioning = true;
      gsap.to(this.anim, { qA: 0, qY: -30, duration: 0.3, onComplete: () => {
        if (this._dead) return;
        setTimeout(() => { if (!this._dead) this._startRound(); }, 300);
      }});
    }, 2500);
  }

  _showResult() {
    this.phase = 'result'; this.anim.resultA = 0;
    gsap.to(this.anim, { resultA: 1, duration: 0.6 });
  }

  _leaveGame() { this.onBack(); }

  async _reportQuestion() {
    const q = this.questions[this.round];
    if (!q?.id || this.reportedQ.has(this.round)) return;
    this.reportedQ.add(this.round);
    try { await supabase.from('quiz_questions').update({ reported: true }).eq('id', q.id); } catch(e) {}
  }

  // ── Input ──────────────────────────────────────────────────────────────────
  _resize() {
    const r = this.canvas.getBoundingClientRect();
    this.W = r.width || window.innerWidth; this.H = r.height || window.innerHeight;
    this.canvas.width = this.W * this.dpr; this.canvas.height = this.H * this.dpr;
  }
  _pos(e) {
    const r = this.canvas.getBoundingClientRect();
    if (e.touches) return { x: e.touches[0].clientX - r.left, y: e.touches[0].clientY - r.top };
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  _hit(p, a) { return a && p.x >= a.x && p.x <= a.x + a.w && p.y >= a.y && p.y <= a.y + a.h; }

  _onMove(e) {
    const p = this._pos(e);
    for (let i = 0; i < 4; i++) gsap.to(this.anim.ansH, { [i]: this._hit(p, this.hits[`a${i}`]) ? 1 : 0, duration: 0.15 });
    gsap.to(this.anim, { playH: this._hit(p, this.hits.play) ? 1 : 0, duration: 0.15 });
    gsap.to(this.anim, { backH: this._hit(p, this.hits.back) ? 1 : 0, duration: 0.15 });
    gsap.to(this.anim, { exitH: this._hit(p, this.hits.exit) ? 1 : 0, duration: 0.15 });
    gsap.to(this.anim, { leaveH: this._hit(p, this.hits.leave) ? 1 : 0, duration: 0.15 });
    gsap.to(this.anim, { reportH: this._hit(p, this.hits.report) ? 1 : 0, duration: 0.15 });
    gsap.to(this.anim, { botMinusH: this._hit(p, this.hits.botMinus) ? 1 : 0, duration: 0.15 });
    gsap.to(this.anim, { botPlusH: this._hit(p, this.hits.botPlus) ? 1 : 0, duration: 0.15 });
    gsap.to(this.anim, { bfH: this._hit(p, this.hits.bf) ? 1 : 0, duration: 0.15 });
    for (let i = 0; i < 3; i++) {
      const h = this._hit(p, this.hits[`diff${i}`]);
      gsap.to(this.anim.diffH, { [i]: h ? 1 : 0, duration: 0.15 });
    }
    const any = Object.values(this.hits).some(a => a && this._hit(p, a));
    this.canvas.style.cursor = any ? 'pointer' : 'default';
  }

  _onClick(e) {
    const p = this._pos(e);
    if (this.phase === 'menu') {
      if (this._hit(p, this.hits.back)) { this.onBack(); return; }
      if (this._hit(p, this.hits.play)) this._startGame();
      if (this._hit(p, this.hits.bf)) this._openFriends();
      if (this._hit(p, this.hits.botMinus) && this.botCount > 1) this.botCount--;
      if (this._hit(p, this.hits.botPlus) && this.botCount < 7) this.botCount++;
      for (let i = 0; i < 3; i++) {
        if (this._hit(p, this.hits[`diff${i}`])) this.difficulty = this.difficulty === (i+1) ? null : (i+1);
      }
    }
    if (this.phase === 'question') {
      for (let i = 0; i < 4; i++) { if (this._hit(p, this.hits[`a${i}`])) this._submitAnswer(i); }
      if (this._hit(p, this.hits.leave)) this._leaveGame();
      if (this._hit(p, this.hits.report)) this._reportQuestion();
    }
    if (this.phase === 'reveal') {
      if (this._hit(p, this.hits.leave)) this._leaveGame();
      if (this._hit(p, this.hits.report)) this._reportQuestion();
    }
    if (this.phase === 'result') {
      if (this._hit(p, this.hits.exit)) this.onBack();
      if (this._hit(p, this.hits.play)) this._startGame();
    }
  }

  // ── Loop ───────────────────────────────────────────────────────────────────
  _loop() {
    if (this._dead) return;
    requestAnimationFrame(() => this._loop());
    this._time += 0.016;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this._draw();
  }

  _draw() {
    if (this.gameState === 'duel') return;
    const { ctx, W, H } = this;
    // Dark blue gradient
    const mg = ctx.createLinearGradient(0, 0, 0, H);
    mg.addColorStop(0, '#030318'); mg.addColorStop(0.5, '#0a0a2e'); mg.addColorStop(1, '#050520');
    ctx.fillStyle = mg; ctx.fillRect(0, 0, W, H);

    if (this.phase === 'menu') this._drawMenu();
    else if (this.phase === 'countdown') this._drawCountdown();
    else if ((this.phase === 'question' || this.phase === 'reveal') && !this._transitioning) this._drawQuestion();
    else if (this.phase === 'result') this._drawResult();
  }

  _drawMenu() {
    const { ctx, W, H, anim } = this;
    const mobile = W < 600; const cx = W / 2; const cy = H / 2;
    ctx.save(); ctx.globalAlpha = anim.menuA; ctx.translate(0, anim.menuY);

    // Back
    const bbw = mobile ? 90 : 110, bbh = 36;
    const bb = { x: 16, y: 16, w: bbw, h: bbh };
    this.hits.back = bb;
    rr(ctx, bb.x, bb.y, bbw, bbh, 12);
    ctx.fillStyle = anim.backH ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)'; ctx.fill();
    rr(ctx, bb.x, bb.y, bbw, bbh, 12);
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.font = `600 ${mobile ? 12 : 13}px Inter, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = C.muted; ctx.fillText('← Späť', bb.x + bbw/2, bb.y + bbh/2);

    // Title glow
    const glow = ctx.createRadialGradient(cx, cy - 100, 10, cx, cy - 100, 320);
    glow.addColorStop(0, hex2rgba(C.purple, 0.15)); glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow; ctx.fillRect(cx - 350, cy - 350, 700, 500);

    // Title with shimmer gradient
    const fz = Math.max(28, Math.min(52, W * 0.07));
    ctx.save();
    ctx.font = `900 ${fz}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const tg = ctx.createLinearGradient(cx - 200, 0, cx + 200, 0);
    const shift = (Math.sin(this._time * 0.8) + 1) / 2;
    tg.addColorStop(0, '#6b21a8'); tg.addColorStop(shift * 0.5, C.purpleL);
    tg.addColorStop(0.5, '#fff'); tg.addColorStop(0.5 + shift * 0.5, C.purpleL);
    tg.addColorStop(1, '#6b21a8');
    ctx.fillStyle = tg;
    ctx.fillText('MILIONÁR', cx, cy - 120);
    ctx.restore();

    ctx.font = `900 ${mobile ? 18 : 28}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = C.gold;
    ctx.fillText('BATTLE', cx, cy - 78);

    // Subtitle
    ctx.font = `400 ${mobile ? 12 : 15}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = C.muted;
    ctx.fillText(`Ty vs ${this.botCount} ${this.botCount === 1 ? 'BOT' : 'BOTi'} • 14 otázok`, cx, cy - 48);

    // Bot count selector
    const bcY = cy - 18;
    ctx.font = `500 ${mobile ? 11 : 12}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillText('Počet BOTov:', cx, bcY);
    const btnS = mobile ? 30 : 34;
    const minus = { x: cx - btnS * 1.6, y: bcY + 10, w: btnS, h: btnS };
    const plus  = { x: cx + btnS * 0.6, y: bcY + 10, w: btnS, h: btnS };
    this.hits.botMinus = minus; this.hits.botPlus = plus;
    [minus, plus].forEach((b, i) => {
      const hv = i === 0 ? anim.botMinusH : anim.botPlusH;
      rr(ctx, b.x, b.y, btnS, btnS, 10);
      ctx.fillStyle = `rgba(255,255,255,${0.04 + hv * 0.08})`; ctx.fill();
      rr(ctx, b.x, b.y, btnS, btnS, 10);
      ctx.strokeStyle = hex2rgba(C.purpleL, 0.3 + hv * 0.3); ctx.lineWidth = 1.5; ctx.stroke();
      ctx.font = `700 ${mobile ? 16 : 20}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = i === 0 ? (this.botCount <= 1 ? C.muted : C.purpleL) : (this.botCount >= 7 ? C.muted : C.purpleL);
      ctx.fillText(i === 0 ? '−' : '+', b.x + btnS/2, b.y + btnS/2);
    });
    ctx.font = `900 ${mobile ? 20 : 26}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = C.purpleL;
    ctx.fillText(`${this.botCount}`, cx, bcY + 10 + btnS/2);

    // Difficulty selector (same style as H&L)
    const diffLabels = ['Ľahká', 'Stredná', 'Ťažká'];
    const diffColors = ['#22c55e', '#f59e0b', '#ef4444'];
    const dbw = 90, dbh = 38, dgap = 12;
    const dtotalW = dbw * 3 + dgap * 2;
    const dsy = bcY + btnS + 24;
    ctx.font = '500 11px Inter, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillText(this.difficulty ? '' : '⚠️ Vyber obtiažnosť!', cx, dsy - 12);
    for (let i = 0; i < 3; i++) {
      const dx = cx - dtotalW/2 + i * (dbw + dgap);
      const da = { x: dx, y: dsy, w: dbw, h: dbh };
      this.hits[`diff${i}`] = da;
      const active = this.difficulty === (i + 1);
      const hover = this.anim.diffH[i];
      ctx.save();
      rr(ctx, dx, dsy, dbw, dbh, 12);
      ctx.fillStyle = active ? hex2rgba(diffColors[i], 0.25) : `rgba(255,255,255,${0.03 + hover * 0.05})`;
      ctx.fill();
      ctx.strokeStyle = active ? diffColors[i] : `rgba(255,255,255,${0.1 + hover * 0.15})`;
      ctx.lineWidth = active ? 2 : 1; ctx.stroke();
      ctx.font = `${active ? 700 : 500} 13px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = active ? diffColors[i] : `rgba(255,255,255,${0.7 + hover * 0.3})`;
      ctx.fillText(diffLabels[i], dx + dbw/2, dsy + dbh/2);
      ctx.restore();
    }

    // HRAŤ button (gold style like H&L)
    const pbw = 260, pbh = 58;
    const pb = { x: cx - pbw/2, y: dsy + dbh + 24, w: pbw, h: pbh };
    this.hits.play = pb;
    const canPlay = !!this.difficulty;
    ctx.save();
    ctx.shadowColor = canPlay ? C.purple : '#222'; ctx.shadowBlur = canPlay ? 12 + anim.playH * 24 : 0;
    const g = ctx.createLinearGradient(pb.x, pb.y, pb.x, pb.y + pbh);
    if (canPlay) { g.addColorStop(0, anim.playH ? C.purpleL : C.purple); g.addColorStop(1, anim.playH ? C.purple : '#6b21a8'); }
    else { g.addColorStop(0, '#333'); g.addColorStop(1, '#222'); }
    rr(ctx, pb.x, pb.y, pbw, pbh, 16); ctx.fillStyle = g; ctx.fill(); ctx.shadowBlur = 0;
    ctx.font = '800 20px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = canPlay ? '#fff' : '#555';
    ctx.fillText('💎 HRAŤ', cx, pb.y + pbh/2);
    ctx.restore();

    // ONLINE DUEL button
    const bfw = 260, bfh = 58;
    const bf = { x: cx - bfw/2, y: pb.y + pbh + 14, w: bfw, h: bfh };
    this.hits.bf = bf;
    ctx.save();
    ctx.shadowColor = C.purple; ctx.shadowBlur = anim.bfH * 16;
    rr(ctx, bf.x, bf.y, bfw, bfh, 16);
    ctx.fillStyle = anim.bfH ? hex2rgba(C.purple, 0.12) : 'rgba(255,255,255,0.03)'; ctx.fill();
    ctx.strokeStyle = anim.bfH ? C.purpleL : hex2rgba(C.purple, 0.5); ctx.lineWidth = 2; ctx.stroke(); ctx.shadowBlur = 0;
    ctx.font = '700 18px Inter, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = anim.bfH ? '#fff' : hex2rgba(C.purple, 0.8);
    ctx.fillText('⚔️  ONLINE DUEL', cx, bf.y + bfh/2);
    ctx.restore();

    ctx.restore();
  }

  _drawCountdown() {
    const { ctx, W, H, anim } = this;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    this._drawPlayersBar();
    ctx.save(); ctx.translate(W/2, H/2);
    ctx.scale(anim.countdownScale, anim.countdownScale);
    ctx.font = '900 120px Inter, system-ui, sans-serif'; ctx.fillStyle = C.purple;
    ctx.shadowColor = C.purple; ctx.shadowBlur = 30;
    ctx.fillText(this.countdownNum > 0 ? `${this.countdownNum}` : 'GO!', 0, 0);
    ctx.restore();
  }

  _drawPlayersBar() {
    const { ctx, W } = this;
    const mobile = W < 600;
    const rowH = mobile ? 32 : 40;
    const myScore = this.myAlive ? this.round : Math.max(0, this.round - 1);
    const all = [
      { name: '👤 Ty', alive: this.myAlive, score: myScore, color: C.purple },
      ...this.bots.map(b => ({ name: b.name, alive: b.alive, score: b.score, color: C.gold }))
    ];
    const total = all.length;
    const colW = Math.min(mobile ? 80 : 110, (W - 16) / total);
    const startX = W/2 - (total - 1) * colW / 2;
    all.forEach((p, i) => {
      const x = startX + i * colW;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.globalAlpha = p.alive ? 1 : 0.35;
      // Name
      ctx.font = `600 ${mobile ? 9 : 11}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = p.alive ? (i === 0 ? C.purpleL : C.text) : C.dim;
      ctx.fillText(p.alive ? p.name : `✕ ${p.name}`, x, mobile ? 14 : 18);
      // Score badge
      const prize = PRIZES[Math.min(p.score, PRIZES.length - 1)];
      ctx.font = `700 ${mobile ? 8 : 10}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = p.alive ? (i === 0 ? C.purpleL : C.goldL) : '#555';
      ctx.fillText(p.score > 0 ? `Ot.${p.score}` : '–', x, mobile ? 25 : 32);
      ctx.globalAlpha = 1;
    });
  }

  _drawQuestion() {
    const { ctx, W, H, anim } = this;
    const mobile = W < 600; const cx = W / 2;
    const q = this.questions[this.round];
    if (!q) return;

    this._drawPlayersBar();
    ctx.save(); ctx.globalAlpha = anim.qA; ctx.translate(0, anim.qY);

    // Prize ladder (desktop)
    if (!mobile) {
      const lx = W - 120, ly = 60;
      ctx.textAlign = 'right';
      for (let i = Math.min(this.round + 3, PRIZES.length - 1); i >= Math.max(0, this.round - 1); i--) {
        const py = ly + (Math.min(this.round + 3, PRIZES.length - 1) - i) * 22;
        const isCurrent = i === this.round;
        ctx.font = `${isCurrent ? 700 : 500} ${isCurrent ? 12 : 10}px Inter, system-ui, sans-serif`;
        ctx.fillStyle = isCurrent ? C.gold : (i < this.round ? C.dim : C.muted);
        ctx.fillText(`${i + 1}. ${PRIZES[i]}`, lx, py);
        if (isCurrent) { ctx.fillStyle = C.gold; ctx.fillText('►', lx - ctx.measureText(`${i+1}. ${PRIZES[i]}`).width - 8, py); }
      }
      ctx.textAlign = 'center';
    }

    // Prize
    const headerY = mobile ? 48 : 58;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `700 ${mobile ? 12 : 14}px Inter, system-ui, sans-serif`; ctx.fillStyle = C.gold;
    ctx.fillText(`Za ${PRIZES[Math.min(this.round, PRIZES.length - 1)]}`, cx, headerY);

    // Timer
    const tw = mobile ? Math.min(W - 40, 200) : 240, th = 5, ty = headerY + 16;
    const pct = Math.max(0, this.timer / ROUND_TIME);
    rr(ctx, cx - tw/2, ty, tw, th, 3); ctx.fillStyle = '#222'; ctx.fill();
    if (pct > 0) { rr(ctx, cx - tw/2, ty, tw * pct, th, 3); ctx.fillStyle = pct > 0.3 ? C.purple : C.red; ctx.fill(); }
    ctx.font = `700 ${mobile ? 11 : 13}px Inter, system-ui, sans-serif`; ctx.fillStyle = pct > 0.3 ? C.muted : C.red;
    ctx.fillText(`${Math.ceil(this.timer)}s`, cx, ty + 16);

    // Question
    const qcw = Math.min(W - 30, 480), qch = mobile ? 80 : 100, qcy = ty + 40;
    rr(ctx, cx - qcw/2, qcy, qcw, qch, 16);
    const qbg = ctx.createLinearGradient(cx - qcw/2, qcy, cx + qcw/2, qcy);
    qbg.addColorStop(0, '#0d0d3d'); qbg.addColorStop(0.5, '#141450'); qbg.addColorStop(1, '#0d0d3d');
    ctx.fillStyle = qbg; ctx.fill();
    rr(ctx, cx - qcw/2, qcy, qcw, qch, 16);
    ctx.strokeStyle = hex2rgba(C.purpleL, 0.3); ctx.lineWidth = 1.5; ctx.stroke();
    ctx.font = `700 ${mobile ? 14 : 18}px Inter, system-ui, sans-serif`; ctx.fillStyle = C.text;
    const words = q.q.split(' '); let line = '', lines = [];
    for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > qcw - 30 && line) { lines.push(line); line = w; } else line = t; }
    if (line) lines.push(line);
    const lh = mobile ? 20 : 24;
    lines.forEach((l, i) => ctx.fillText(l, cx, qcy + qch/2 - (lines.length - 1) * lh/2 + i * lh));

    // Answers
    const abw = mobile ? (W - 30) / 2 - 5 : 220, abh = mobile ? 46 : 52, agap = 8;
    const astartY = qcy + qch + 18, astartX = cx - abw - agap/2;
    const labels = ['A', 'B', 'C', 'D'];
    for (let i = 0; i < 4; i++) {
      const col = i % 2, row = Math.floor(i / 2);
      const ax = astartX + col * (abw + agap), ay = astartY + row * (abh + agap);
      this.hits[`a${i}`] = { x: ax, y: ay, w: abw, h: abh };
      const hover = this.anim.ansH[i], isCorrect = i === q.correct, isMyPick = this.myAnswer === i, revealing = this.phase === 'reveal';
      let bgColor, borderColor, textColor;
      if (revealing) {
        if (isCorrect) { bgColor = hex2rgba(C.green, 0.25); borderColor = C.green; textColor = C.greenL; }
        else if (isMyPick) { bgColor = hex2rgba(C.red, 0.2); borderColor = C.red; textColor = C.redL; }
        else { bgColor = 'rgba(255,255,255,0.02)'; borderColor = hex2rgba(C.purpleL, 0.05); textColor = C.dim; }
      } else if (isMyPick) { bgColor = hex2rgba(C.purple, 0.25); borderColor = C.purple; textColor = '#fff'; }
      else { bgColor = `rgba(255,255,255,${0.02 + hover * 0.05})`; borderColor = hex2rgba(C.purpleL, 0.12 + hover * 0.2); textColor = `rgba(255,255,255,${0.7 + hover * 0.3})`; }
      rr(ctx, ax, ay, abw, abh, 14); ctx.fillStyle = bgColor; ctx.fill();
      rr(ctx, ax, ay, abw, abh, 14); ctx.strokeStyle = borderColor; ctx.lineWidth = revealing && isCorrect ? 2 : 1; ctx.stroke();
      ctx.font = `700 ${mobile ? 13 : 15}px Inter, system-ui, sans-serif`; ctx.fillStyle = textColor;
      ctx.fillText(`${labels[i]}: ${q.answers[i]}`, ax + abw/2, ay + abh/2);
    }

    // Bot statuses during reveal
    if (this.phase === 'reveal') {
      const bsY = astartY + 2 * (abh + agap) + 12;
      this.bots.forEach((b, i) => {
        const bx = cx - 120 + i * 120;
        ctx.font = `500 ${mobile ? 10 : 12}px Inter, system-ui, sans-serif`;
        ctx.fillStyle = b.alive ? C.greenL : C.redL;
        ctx.fillText(`${b.name.split(' ')[1]}: ${b.lastAnswer === q.correct ? '✓' : '✕'}`, bx, bsY);
      });
    }

    // Leave + Report
    const btnY = astartY + 2 * (abh + agap) + (this.phase === 'reveal' ? 30 : 14);
    const lbw = mobile ? 80 : 100, lbh = 30;
    const leave = { x: cx - lbw - 5, y: btnY, w: lbw, h: lbh };
    this.hits.leave = leave;
    rr(ctx, leave.x, leave.y, lbw, lbh, 10);
    ctx.fillStyle = anim.leaveH ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.03)'; ctx.fill();
    rr(ctx, leave.x, leave.y, lbw, lbh, 10);
    ctx.strokeStyle = anim.leaveH ? C.red : 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.font = `600 ${mobile ? 10 : 11}px Inter, system-ui, sans-serif`; ctx.fillStyle = anim.leaveH ? C.redL : C.dim;
    ctx.fillText('🚪 Odísť', leave.x + lbw/2, leave.y + lbh/2);

    const reported = this.reportedQ.has(this.round);
    const report = { x: cx + 5, y: btnY, w: lbw, h: lbh };
    this.hits.report = report;
    rr(ctx, report.x, report.y, lbw, lbh, 10);
    ctx.fillStyle = reported ? 'rgba(239,68,68,0.1)' : (anim.reportH ? 'rgba(251,191,36,0.1)' : 'rgba(255,255,255,0.03)'); ctx.fill();
    rr(ctx, report.x, report.y, lbw, lbh, 10);
    ctx.strokeStyle = reported ? C.red : (anim.reportH ? C.gold : 'rgba(255,255,255,0.08)'); ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = reported ? C.redL : (anim.reportH ? C.goldL : C.dim);
    ctx.fillText(reported ? '⚠️ Nahlásené' : '⚠️ Nahlásiť', report.x + lbw/2, report.y + lbh/2);

    ctx.restore();
  }

  _drawResult() {
    const { ctx, W, H, anim } = this;
    const mobile = W < 600;
    ctx.save(); ctx.globalAlpha = anim.resultA;
    const cx = W/2, cy = H/2;
    const pw = Math.min(440, W - 20), ph = 440;
    const px = cx - pw/2, py = cy - ph/2;
    rr(ctx, px, py, pw, ph, 28);
    const bg = ctx.createLinearGradient(px, py, px, py + ph);
    bg.addColorStop(0, '#0d0d3d'); bg.addColorStop(1, '#050520');
    ctx.fillStyle = bg; ctx.fill();
    rr(ctx, px, py, pw, ph, 28); ctx.strokeStyle = C.purple; ctx.lineWidth = 2; ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

    const myPrize = this.myAlive ? this.round : Math.max(0, this.round - 1);
    const won = this.myAlive;
    ctx.font = `900 ${mobile ? 28 : 34}px Inter, system-ui, sans-serif`;
    ctx.shadowColor = won ? C.gold : C.red; ctx.shadowBlur = 20; ctx.fillStyle = won ? C.gold : C.red;
    ctx.fillText(won ? '💎 GRATULUJEME!' : '😞 KONIEC HRY', cx, py + 55); ctx.shadowBlur = 0;
    ctx.font = `800 ${mobile ? 22 : 28}px Inter, system-ui, sans-serif`; ctx.fillStyle = C.goldL;
    ctx.fillText(`Výhra: ${PRIZES[Math.min(myPrize, PRIZES.length - 1)]}`, cx, py + 100);
    ctx.font = '500 13px Inter, system-ui, sans-serif'; ctx.fillStyle = C.muted;
    ctx.fillText(`Dosiahol si otázku ${this.round} z ${this.questions.length}`, cx, py + 130);

    // Leaderboard
    const all = [
      { name: '👤 Ty', score: myPrize, alive: this.myAlive },
      ...this.bots.map(b => ({ name: b.name, score: b.score, alive: b.alive })),
    ].sort((a, b) => b.score - a.score);
    ctx.font = '700 14px Inter, system-ui, sans-serif'; ctx.fillStyle = C.muted;
    ctx.fillText('🏆 Poradie', cx, py + 165);
    const medals = ['🥇', '🥈', '🥉', '4.'];
    all.forEach((p, i) => {
      const ly = py + 195 + i * 32;
      ctx.font = `${i === 0 ? 700 : 500} ${mobile ? 13 : 15}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = i === 0 ? C.goldL : (p.alive ? C.text : C.dim);
      ctx.fillText(`${medals[i]} ${p.name} — ${PRIZES[Math.min(p.score, PRIZES.length - 1)]}`, cx, ly);
    });

    // Buttons
    const bbw = 160, bbh = 44;
    const pb = { x: cx - bbw - 8, y: py + ph - 65, w: bbw, h: bbh };
    this.hits.play = pb;
    rr(ctx, pb.x, pb.y, bbw, bbh, 14);
    ctx.fillStyle = hex2rgba(C.purple, 0.15 + anim.playH * 0.15); ctx.fill();
    rr(ctx, pb.x, pb.y, bbw, bbh, 14); ctx.strokeStyle = C.purple; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.font = '700 14px Inter, system-ui, sans-serif'; ctx.fillStyle = C.purpleL;
    ctx.fillText('🔄 Hrať znova', pb.x + bbw/2, pb.y + bbh/2);

    const eb = { x: cx + 8, y: py + ph - 65, w: bbw, h: bbh };
    this.hits.exit = eb;
    rr(ctx, eb.x, eb.y, bbw, bbh, 14);
    ctx.fillStyle = hex2rgba(C.gold, 0.1 + anim.exitH * 0.1); ctx.fill();
    rr(ctx, eb.x, eb.y, bbw, bbh, 14); ctx.strokeStyle = C.gold; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = C.goldL; ctx.fillText('🔙 Menu', eb.x + bbw/2, eb.y + bbh/2);
    ctx.restore();
  }
}
