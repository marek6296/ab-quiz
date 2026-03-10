import gsap from 'gsap';
import { supabase } from './lib/supabase';

// ─── PALETTE ─────────────────────────────────────────────────────────────────
const C = {
  bg: '#050505', gold: '#f59e0b', goldL: '#fbbf24', goldD: '#d97706',
  green: '#22c55e', greenL: '#4ade80', red: '#ef4444', redL: '#f87171',
  purple: '#a855f7', blue: '#3b82f6', blueL: '#60a5fa',
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
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ─── FALLBACK QUESTIONS ──────────────────────────────────────────────────────
const FALLBACK_QS = [
  { q: 'Aké je hlavné mesto Slovenska?', answers: ['Bratislava', 'Košice', 'Žilina', 'Prešov'], correct: 0, difficulty: 1 },
  { q: 'Koľko planét má Slnečná sústava?', answers: ['7', '8', '9', '10'], correct: 1, difficulty: 1 },
  { q: 'Kto napísal Romea a Júliu?', answers: ['Dickens', 'Shakespeare', 'Tolstoj', 'Hemingway'], correct: 1, difficulty: 1 },
  { q: 'V ktorom roku padol Berlínsky múr?', answers: ['1987', '1988', '1989', '1990'], correct: 2, difficulty: 2 },
  { q: 'Aký je chemický vzorec vody?', answers: ['CO2', 'H2O', 'NaCl', 'O2'], correct: 1, difficulty: 1 },
  { q: 'Ktorá krajina má najviac obyvateľov?', answers: ['USA', 'India', 'Čína', 'Rusko'], correct: 1, difficulty: 2 },
  { q: 'Aký je najväčší oceán?', answers: ['Atlantický', 'Indický', 'Tichý', 'Severný ľadový'], correct: 2, difficulty: 2 },
  { q: 'Kto namaľoval Monu Lízu?', answers: ['Picasso', 'Van Gogh', 'Da Vinci', 'Michelangelo'], correct: 2, difficulty: 1 },
  { q: 'Koľko minút má hodina?', answers: ['30', '45', '60', '90'], correct: 2, difficulty: 1 },
  { q: 'Ktoré zviera je najrýchlejšie?', answers: ['Lev', 'Gepard', 'Kôň', 'Antilopa'], correct: 1, difficulty: 1 },
  { q: 'Aké je hlavné mesto Francúzska?', answers: ['Lyon', 'Marseille', 'Paríž', 'Nice'], correct: 2, difficulty: 1 },
  { q: 'Koľko kostí má dospelý človek?', answers: ['106', '156', '206', '256'], correct: 2, difficulty: 2 },
  { q: 'Ktorý prvok má symbol Fe?', answers: ['Fluór', 'Fosfor', 'Železo', 'Francium'], correct: 2, difficulty: 2 },
  { q: 'V ktorom roku sa začala 2. svetová vojna?', answers: ['1935', '1937', '1939', '1941'], correct: 2, difficulty: 2 },
  { q: 'Aký je najvyšší vrch sveta?', answers: ['K2', 'Everest', 'Kilimandžáro', 'Mont Blanc'], correct: 1, difficulty: 1 },
  { q: 'Koľko dní má prestupný rok?', answers: ['364', '365', '366', '367'], correct: 2, difficulty: 2 },
  { q: 'Kde sa konali OH 2024?', answers: ['Tokyo', 'Paríž', 'Los Angeles', 'Londýn'], correct: 1, difficulty: 2 },
  { q: 'Koľko chromozómov má človek?', answers: ['23', '44', '46', '48'], correct: 2, difficulty: 3 },
  { q: 'Kto vynašiel žiarovku?', answers: ['Tesla', 'Edison', 'Bell', 'Watt'], correct: 1, difficulty: 2 },
  { q: 'V ktorom roku pristál človek na Mesiaci?', answers: ['1965', '1967', '1969', '1971'], correct: 2, difficulty: 2 },
  { q: 'Aká je najdlhšia rieka na svete?', answers: ['Amazonka', 'Níl', 'Yangtze', 'Mississippi'], correct: 1, difficulty: 2 },
  { q: 'Koľko hráčov má futbalový tím?', answers: ['9', '10', '11', '12'], correct: 2, difficulty: 1 },
  { q: 'Aký je symbol zlata?', answers: ['Ag', 'Au', 'Zn', 'Cu'], correct: 1, difficulty: 2 },
  { q: 'Koľko zubov má dospelý človek?', answers: ['28', '30', '32', '34'], correct: 2, difficulty: 2 },
  { q: 'Koľko sŕdc má chobotnica?', answers: ['1', '2', '3', '4'], correct: 2, difficulty: 3 },
  { q: 'Aký je vzorec Einsteinovej rovnice?', answers: ['E=mc²', 'F=ma', 'a²+b²=c²', 'PV=nRT'], correct: 0, difficulty: 3 },
  { q: 'Koľko litrov krvi má dospelý človek?', answers: ['3', '5', '7', '9'], correct: 1, difficulty: 3 },
  { q: 'Ktorá planéta je najbližšie k Slnku?', answers: ['Venuša', 'Merkúr', 'Mars', 'Zem'], correct: 1, difficulty: 2 },
  { q: 'Koľko nôh má pavúk?', answers: ['6', '8', '10', '12'], correct: 1, difficulty: 1 },
  { q: 'Kto zložil Deviatú symfóniu?', answers: ['Mozart', 'Bach', 'Beethoven', 'Chopin'], correct: 2, difficulty: 3 },
];

// Load from DB, fallback to hardcoded
async function loadQuestions(difficulty = null) {
  try {
    let query = supabase.from('quiz_questions').select('*').eq('reported', false);
    if (difficulty) query = query.eq('difficulty', difficulty);
    const { data, error } = await query;
    if (!error && data && data.length >= 10) {
      return data.map(r => ({
        id: r.id,
        q: r.question,
        answers: [r.answer_a, r.answer_b, r.answer_c, r.answer_d],
        correct: r.correct_answer,
        difficulty: r.difficulty,
      }));
    }
  } catch (e) { console.warn('Quiz DB load failed, using fallback:', e); }
  let qs = FALLBACK_QS;
  if (difficulty) qs = qs.filter(q => q.difficulty === difficulty);
  if (qs.length < 10) qs = FALLBACK_QS;
  return qs;
}

const ROUND_TIME = 12;
const TOTAL_ROUNDS = 10;

// ── BOT ──────────────────────────────────────────────────────────────────────
class Bot {
  constructor(difficulty = 'medium') {
    const d = { easy: { speed: [5, 9], accuracy: 0.5 }, medium: { speed: [3, 7], accuracy: 0.72 }, hard: { speed: [1.5, 4], accuracy: 0.9 } };
    this.cfg = d[difficulty] || d.medium;
  }
  getAnswer(correctIdx) {
    const correct = Math.random() < this.cfg.accuracy;
    const [min, max] = this.cfg.speed;
    const delay = min + Math.random() * (max - min);
    if (correct) return { answer: correctIdx, delay };
    let wrong; do { wrong = Math.floor(Math.random() * 4); } while (wrong === correctIdx);
    return { answer: wrong, delay };
  }
}

// ─── QUIZ DUEL GAME ──────────────────────────────────────────────────────────
export class QuizDuelGame {
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
    this.myScore = 0; this.botScore = 0;
    this.myAnswer = null; this.botAnswer = null;
    this.botDifficulty = null; // null = not selected yet (required!)
    this.bot = null;
    this.timer = ROUND_TIME;
    this._timerInterval = null;
    this.questions = [];
    this.countdownNum = 3;
    this.reportedQ = new Set();
    this._transitioning = false;

    this.anim = {
      menuA: 0, menuY: 30,
      qA: 0, qY: 20,
      ansH: [0, 0, 0, 0],
      timerPulse: 0,
      revealA: 0, resultA: 0,
      countdownScale: 0,
      diffH: [0, 0, 0],
      playH: 0, backH: 0, exitH: 0, leaveH: 0, reportH: 0,
      errorFlash: 0,
    };
    this.hits = {};

    this._resize = this._resize.bind(this);
    this._onMove = this._onMove.bind(this);
    this._onClick = this._onClick.bind(this);
    window.addEventListener('resize', this._resize);
    canvas.addEventListener('mousemove', this._onMove);
    canvas.addEventListener('mousedown', this._onClick);
    canvas.addEventListener('touchstart', (e) => this._onClick(e), { passive: true });
    this._resize();
  }

  start() { this._animateMenu(); this._loop(); }

  destroy() {
    this._dead = true;
    clearInterval(this._timerInterval); clearTimeout(this._botTimeout);
    window.removeEventListener('resize', this._resize);
    this.canvas.removeEventListener('mousemove', this._onMove);
    this.canvas.removeEventListener('mousedown', this._onClick);
    gsap.killTweensOf(this.anim);
  }

  setUser(u) { this.user = u; }

  _animateMenu() {
    this.phase = 'menu'; this.anim.menuA = 0; this.anim.menuY = 30;
    gsap.to(this.anim, { menuA: 1, menuY: 0, duration: 0.6, ease: 'back.out(1.4)', delay: 0.1 });
  }

  async _startGame() {
    if (!this.botDifficulty) {
      gsap.fromTo(this.anim, { errorFlash: 1 }, { errorFlash: 0, duration: 0.8 });
      return;
    }
    const all = await loadQuestions();
    this.questions = shuffle(all).slice(0, TOTAL_ROUNDS);
    this.round = 0; this.myScore = 0; this.botScore = 0;
    this.bot = new Bot(this.botDifficulty);
    this.reportedQ = new Set();
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
    this.myAnswer = null; this.botAnswer = null;
    this.timer = ROUND_TIME;
    this.anim.revealA = 0;
    this._transitioning = false;
    this.anim.qA = 0; this.anim.qY = 20;
    gsap.to(this.anim, { qA: 1, qY: 0, duration: 0.5, ease: 'back.out(1.2)' });
    for (let i = 0; i < 4; i++) this.anim.ansH[i] = 0;

    const q = this.questions[this.round];
    const botResult = this.bot.getAnswer(q.correct);
    this._botTimeout = setTimeout(() => {
      if (this._dead || this.phase !== 'question') return;
      this.botAnswer = botResult.answer;
      if (this.myAnswer !== null) this._doReveal();
    }, botResult.delay * 1000);

    clearInterval(this._timerInterval);
    this._timerInterval = setInterval(() => {
      if (this._dead || this.phase !== 'question') return;
      this.timer -= 0.1;
      if (this.timer <= 0) { this.timer = 0; clearInterval(this._timerInterval); this._doReveal(); }
    }, 100);
  }

  _submitAnswer(idx) {
    if (this.phase !== 'question' || this.myAnswer !== null) return;
    this.myAnswer = idx;
    if (this.botAnswer !== null) this._doReveal();
  }

  _doReveal() {
    if (this.phase !== 'question') return;
    clearInterval(this._timerInterval); clearTimeout(this._botTimeout);
    this.phase = 'reveal';
    const q = this.questions[this.round];
    if (this.myAnswer === q.correct) this.myScore++;
    if (this.botAnswer === q.correct) this.botScore++;
    gsap.to(this.anim, { revealA: 1, duration: 0.5 });

    setTimeout(() => {
      if (this._dead) return;
      this.round++;
      if (this.round >= TOTAL_ROUNDS) { this._showResult(); return; }
      this._transitioning = true;
      gsap.to(this.anim, { qA: 0, qY: -30, duration: 0.3, onComplete: () => {
        if (this._dead) return;
        setTimeout(() => { if (!this._dead) this._startRound(); }, 200);
      }});
    }, 2500);
  }

  _showResult() {
    this.phase = 'result'; this.anim.resultA = 0;
    gsap.to(this.anim, { resultA: 1, duration: 0.6, ease: 'power2.out' });
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
    for (let i = 0; i < 3; i++) gsap.to(this.anim.diffH, { [i]: this._hit(p, this.hits[`d${i}`]) ? 1 : 0, duration: 0.15 });
    gsap.to(this.anim, { playH: this._hit(p, this.hits.play) ? 1 : 0, duration: 0.15 });
    gsap.to(this.anim, { backH: this._hit(p, this.hits.back) ? 1 : 0, duration: 0.15 });
    gsap.to(this.anim, { exitH: this._hit(p, this.hits.exit) ? 1 : 0, duration: 0.15 });
    gsap.to(this.anim, { leaveH: this._hit(p, this.hits.leave) ? 1 : 0, duration: 0.15 });
    gsap.to(this.anim, { reportH: this._hit(p, this.hits.report) ? 1 : 0, duration: 0.15 });
    const any = Object.values(this.hits).some(a => a && this._hit(p, a));
    this.canvas.style.cursor = any ? 'pointer' : 'default';
  }

  _onClick(e) {
    const p = this._pos(e);
    if (this.phase === 'menu') {
      if (this._hit(p, this.hits.back)) { this.onBack(); return; }
      if (this._hit(p, this.hits.play)) this._startGame();
      const diffs = ['easy', 'medium', 'hard'];
      for (let i = 0; i < 3; i++) {
        if (this._hit(p, this.hits[`d${i}`])) this.botDifficulty = diffs[i];
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
    const { ctx, W, H } = this;
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    if (this.phase === 'menu') this._drawMenu();
    else if (this.phase === 'countdown') this._drawCountdown();
    else if ((this.phase === 'question' || this.phase === 'reveal') && !this._transitioning) this._drawQuestion();
    else if (this.phase === 'result') this._drawResult();
  }

  _drawMenu() {
    const { ctx, W, H, anim } = this;
    const mobile = W < 600;
    const cx = W / 2;
    ctx.save(); ctx.globalAlpha = anim.menuA; ctx.translate(0, anim.menuY);

    // Back
    const bb = { x: 16, y: 16, w: 90, h: 36 };
    this.hits.back = bb;
    rr(ctx, bb.x, bb.y, 90, 36, 12);
    ctx.fillStyle = anim.backH ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)'; ctx.fill();
    rr(ctx, bb.x, bb.y, 90, 36, 12);
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.font = '600 13px Inter, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = C.muted; ctx.fillText('← Späť', bb.x + 45, bb.y + 18);

    // Title
    const titleY = mobile ? 90 : 110;
    ctx.font = `900 ${mobile ? 30 : 44}px Inter, system-ui, sans-serif`;
    ctx.shadowColor = C.green; ctx.shadowBlur = 20; ctx.fillStyle = C.green;
    ctx.fillText('KVÍZ DUEL', cx, titleY); ctx.shadowBlur = 0;
    ctx.font = `500 ${mobile ? 12 : 15}px Inter, system-ui, sans-serif`; ctx.fillStyle = C.muted;
    ctx.fillText('1v1 proti BOTovi • 10 otázok • 12s na odpoveď', cx, titleY + (mobile ? 30 : 40));

    // Difficulty (REQUIRED)
    const diffs = ['Ľahký', 'Stredný', 'Ťažký'];
    const diffKeys = ['easy', 'medium', 'hard'];
    const diffCols = [C.green, C.gold, C.red];
    const dbw = mobile ? 85 : 100, dbh = 40, dgap = 10;
    const dtotalW = dbw * 3 + dgap * 2;
    const dsy = titleY + (mobile ? 65 : 85);

    // Label with error flash
    ctx.font = '600 12px Inter, system-ui, sans-serif';
    const errFlash = anim.errorFlash;
    ctx.fillStyle = errFlash > 0 ? `rgba(239,68,68,${errFlash})` : 'rgba(255,255,255,0.4)';
    ctx.fillText(this.botDifficulty ? 'Obtiažnosť BOTa' : '⚠️ Vyber obtiažnosť!', cx, dsy - 16);

    for (let i = 0; i < 3; i++) {
      const dx = cx - dtotalW / 2 + i * (dbw + dgap);
      const da = { x: dx, y: dsy, w: dbw, h: dbh };
      this.hits[`d${i}`] = da;
      const active = this.botDifficulty === diffKeys[i];
      const hover = this.anim.diffH[i];
      rr(ctx, dx, dsy, dbw, dbh, 12);
      ctx.fillStyle = active ? hex2rgba(diffCols[i], 0.2) : `rgba(255,255,255,${0.03 + hover * 0.05})`; ctx.fill();
      rr(ctx, dx, dsy, dbw, dbh, 12);
      ctx.strokeStyle = active ? diffCols[i] : `rgba(255,255,255,${0.1 + hover * 0.1})`; ctx.lineWidth = active ? 2 : 1; ctx.stroke();
      ctx.font = `${active ? 700 : 500} 13px Inter, system-ui, sans-serif`;
      ctx.fillStyle = active ? diffCols[i] : `rgba(255,255,255,${0.6 + hover * 0.3})`;
      ctx.fillText(diffs[i], dx + dbw / 2, dsy + dbh / 2);
    }

    // Play button
    const pbw = 240, pbh = 56;
    const pb = { x: cx - pbw/2, y: dsy + dbh + 40, w: pbw, h: pbh };
    this.hits.play = pb;
    const canPlay = !!this.botDifficulty;
    ctx.shadowColor = canPlay ? C.green : '#333'; ctx.shadowBlur = canPlay ? (12 + anim.playH * 20) : 0;
    const g = ctx.createLinearGradient(pb.x, pb.y, pb.x, pb.y + pbh);
    if (canPlay) { g.addColorStop(0, anim.playH ? C.greenL : C.green); g.addColorStop(1, anim.playH ? C.green : '#15803d'); }
    else { g.addColorStop(0, '#333'); g.addColorStop(1, '#222'); }
    rr(ctx, pb.x, pb.y, pbw, pbh, 16); ctx.fillStyle = g; ctx.fill(); ctx.shadowBlur = 0;
    ctx.font = '800 20px Inter, system-ui, sans-serif';
    ctx.fillStyle = canPlay ? '#000' : '#666';
    ctx.fillText('⚡ HRAŤ vs BOT', cx, pb.y + pbh / 2);

    ctx.restore();
  }

  _drawCountdown() {
    const { ctx, W, H, anim } = this;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    this._drawScoreboard();
    ctx.save(); ctx.translate(W/2, H/2);
    ctx.scale(anim.countdownScale, anim.countdownScale);
    ctx.font = '900 120px Inter, system-ui, sans-serif'; ctx.fillStyle = C.green;
    ctx.shadowColor = C.green; ctx.shadowBlur = 30;
    ctx.fillText(this.countdownNum > 0 ? `${this.countdownNum}` : 'GO!', 0, 0);
    ctx.restore();
  }

  _drawQuestion() {
    const { ctx, W, H, anim } = this;
    const mobile = W < 600;
    const cx = W / 2;
    const q = this.questions[this.round];
    if (!q) return;

    this._drawScoreboard();

    ctx.save(); ctx.globalAlpha = anim.qA; ctx.translate(0, anim.qY);

    // Round + timer
    const headerY = mobile ? 55 : 65;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `700 ${mobile ? 12 : 14}px Inter, system-ui, sans-serif`; ctx.fillStyle = C.muted;
    ctx.fillText(`Otázka ${this.round + 1} / ${TOTAL_ROUNDS}`, cx, headerY);

    // Timer bar
    const tw = mobile ? Math.min(W - 40, 200) : 240, th = 5;
    const ty = headerY + 16;
    const pct = Math.max(0, this.timer / ROUND_TIME);
    rr(ctx, cx - tw/2, ty, tw, th, 3); ctx.fillStyle = '#222'; ctx.fill();
    if (pct > 0) { rr(ctx, cx - tw/2, ty, tw * pct, th, 3); ctx.fillStyle = pct > 0.3 ? C.green : C.red; ctx.fill(); }
    ctx.font = `700 ${mobile ? 11 : 13}px Inter, system-ui, sans-serif`; ctx.fillStyle = pct > 0.3 ? C.muted : C.red;
    ctx.fillText(`${Math.ceil(this.timer)}s`, cx, ty + 16);

    // Question card
    const qcw = Math.min(W - 30, 500), qch = mobile ? 80 : 100;
    const qcy = ty + 40;
    rr(ctx, cx - qcw/2, qcy, qcw, qch, 16); ctx.fillStyle = '#111'; ctx.fill();
    rr(ctx, cx - qcw/2, qcy, qcw, qch, 16);
    ctx.strokeStyle = hex2rgba(C.green, 0.15); ctx.lineWidth = 1; ctx.stroke();
    ctx.font = `700 ${mobile ? 14 : 18}px Inter, system-ui, sans-serif`; ctx.fillStyle = C.text;
    const words = q.q.split(' '); let line = '', lines = [];
    for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > qcw - 30 && line) { lines.push(line); line = w; } else line = t; }
    if (line) lines.push(line);
    const lh = mobile ? 20 : 24;
    lines.forEach((l, i) => ctx.fillText(l, cx, qcy + qch/2 - (lines.length - 1) * lh/2 + i * lh));

    // Answers (2x2)
    const abw = mobile ? (W - 30) / 2 - 5 : 220;
    const abh = mobile ? 48 : 56;
    const agap = 10;
    const astartY = qcy + qch + 20;
    const astartX = cx - abw - agap/2;
    const labels = ['A', 'B', 'C', 'D'];
    const ansColors = [C.blue, C.purple, C.gold, C.green];

    for (let i = 0; i < 4; i++) {
      const col = i % 2, row = Math.floor(i / 2);
      const ax = astartX + col * (abw + agap), ay = astartY + row * (abh + agap);
      const area = { x: ax, y: ay, w: abw, h: abh };
      this.hits[`a${i}`] = area;
      const hover = this.anim.ansH[i];
      const isCorrect = i === q.correct, isMyPick = this.myAnswer === i, revealing = this.phase === 'reveal';
      let bgColor, borderColor, textColor;
      if (revealing) {
        if (isCorrect) { bgColor = hex2rgba(C.green, 0.25); borderColor = C.green; textColor = C.greenL; }
        else if (isMyPick) { bgColor = hex2rgba(C.red, 0.2); borderColor = C.red; textColor = C.redL; }
        else { bgColor = 'rgba(255,255,255,0.02)'; borderColor = 'rgba(255,255,255,0.05)'; textColor = C.dim; }
      } else if (isMyPick) { bgColor = hex2rgba(ansColors[i], 0.2); borderColor = ansColors[i]; textColor = '#fff'; }
      else { bgColor = `rgba(255,255,255,${0.03 + hover * 0.05})`; borderColor = `rgba(255,255,255,${0.08 + hover * 0.15})`; textColor = `rgba(255,255,255,${0.7 + hover * 0.3})`; }
      rr(ctx, ax, ay, abw, abh, 14); ctx.fillStyle = bgColor; ctx.fill();
      rr(ctx, ax, ay, abw, abh, 14); ctx.strokeStyle = borderColor; ctx.lineWidth = revealing && isCorrect ? 2 : 1; ctx.stroke();
      ctx.font = `700 ${mobile ? 13 : 15}px Inter, system-ui, sans-serif`; ctx.fillStyle = textColor;
      ctx.fillText(`${labels[i]}: ${q.answers[i]}`, ax + abw/2, ay + abh/2);
    }

    // Bot status + bottom bar
    const bsY = astartY + 2 * (abh + agap) + 12;
    ctx.font = `500 ${mobile ? 11 : 13}px Inter, system-ui, sans-serif`;
    if (this.phase === 'reveal') {
      const botCorrect = this.botAnswer === q.correct; ctx.fillStyle = botCorrect ? C.green : C.red;
      const botLabel = this.botAnswer !== null ? q.answers[this.botAnswer] : 'Neodpovedal';
      ctx.fillText(`🤖 BOT: ${botLabel} ${botCorrect ? '✓' : '✕'}`, cx, bsY);
    } else {
      ctx.fillStyle = C.dim;
      ctx.fillText(this.botAnswer !== null ? '🤖 BOT odpovedal ✓' : '🤖 BOT premýšľa...', cx, bsY);
    }

    // Leave + Report buttons
    const btnY = bsY + 24;
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

  _drawScoreboard() {
    const { ctx, W } = this;
    const mobile = W < 600;
    const y = mobile ? 18 : 26;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right'; ctx.font = `700 ${mobile ? 13 : 16}px Inter, system-ui, sans-serif`; ctx.fillStyle = C.greenL;
    ctx.fillText('Ty', W/2 - 45, y);
    ctx.font = `900 ${mobile ? 18 : 22}px Inter, system-ui, sans-serif`; ctx.fillStyle = '#fff';
    ctx.fillText(`${this.myScore}`, W/2 - 18, y);
    ctx.textAlign = 'center'; ctx.font = `700 ${mobile ? 11 : 14}px Inter, system-ui, sans-serif`; ctx.fillStyle = C.dim;
    ctx.fillText('vs', W/2, y);
    ctx.textAlign = 'left'; ctx.font = `900 ${mobile ? 18 : 22}px Inter, system-ui, sans-serif`; ctx.fillStyle = '#fff';
    ctx.fillText(`${this.botScore}`, W/2 + 18, y);
    ctx.font = `700 ${mobile ? 13 : 16}px Inter, system-ui, sans-serif`; ctx.fillStyle = C.purple;
    ctx.fillText('🤖 BOT', W/2 + 45, y);
  }

  _drawResult() {
    const { ctx, W, H, anim } = this;
    const mobile = W < 600;
    ctx.save(); ctx.globalAlpha = anim.resultA;
    ctx.fillStyle = 'rgba(0,0,0,0.88)'; ctx.fillRect(0, 0, W, H);
    const cx = W/2, cy = H/2;
    const pw = Math.min(420, W - 30), ph = 380;
    const px = cx - pw/2, py = cy - ph/2;
    rr(ctx, px, py, pw, ph, 28);
    const bg = ctx.createLinearGradient(px, py, px, py + ph);
    bg.addColorStop(0, '#151515'); bg.addColorStop(1, '#0a0a0a');
    ctx.fillStyle = bg; ctx.fill();
    const won = this.myScore > this.botScore, tied = this.myScore === this.botScore;
    const borderC = won ? C.green : (tied ? C.gold : C.red);
    rr(ctx, px, py, pw, ph, 28); ctx.strokeStyle = borderC; ctx.lineWidth = 2; ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `900 ${mobile ? 32 : 38}px Inter, system-ui, sans-serif`;
    ctx.shadowColor = borderC; ctx.shadowBlur = 20; ctx.fillStyle = borderC;
    ctx.fillText(won ? '🏆 VÝHRA!' : (tied ? '🤝 REMÍZA' : '😞 PREHRA'), cx, py + 65); ctx.shadowBlur = 0;
    ctx.font = '700 18px Inter, system-ui, sans-serif'; ctx.fillStyle = C.greenL; ctx.fillText('Ty', cx - 70, cy - 20);
    ctx.fillStyle = C.purple; ctx.fillText('BOT', cx + 70, cy - 20);
    ctx.font = '900 52px Inter, system-ui, sans-serif'; ctx.fillStyle = '#fff';
    ctx.fillText(`${this.myScore}`, cx - 70, cy + 30); ctx.fillText(`${this.botScore}`, cx + 70, cy + 30);
    ctx.font = '700 22px Inter, system-ui, sans-serif'; ctx.fillStyle = C.dim; ctx.fillText(':', cx, cy + 26);

    const bbw = 170, bbh = 46;
    const pb = { x: cx - bbw - 8, y: py + ph - 70, w: bbw, h: bbh };
    this.hits.play = pb;
    rr(ctx, pb.x, pb.y, bbw, bbh, 14);
    ctx.fillStyle = hex2rgba(C.green, 0.15 + anim.playH * 0.15); ctx.fill();
    rr(ctx, pb.x, pb.y, bbw, bbh, 14); ctx.strokeStyle = C.green; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.font = '700 14px Inter, system-ui, sans-serif'; ctx.fillStyle = C.greenL;
    ctx.fillText('🔄 Hrať znova', pb.x + bbw/2, pb.y + bbh/2);

    const eb = { x: cx + 8, y: py + ph - 70, w: bbw, h: bbh };
    this.hits.exit = eb;
    rr(ctx, eb.x, eb.y, bbw, bbh, 14);
    ctx.fillStyle = hex2rgba(C.gold, 0.1 + anim.exitH * 0.1); ctx.fill();
    rr(ctx, eb.x, eb.y, bbw, bbh, 14); ctx.strokeStyle = C.gold; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = C.goldL; ctx.fillText('🔙 Menu', eb.x + bbw/2, eb.y + bbh/2);
    ctx.restore();
  }
}
