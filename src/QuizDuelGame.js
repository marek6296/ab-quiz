import gsap from 'gsap';
import { supabase } from './lib/supabase';

/* ─── PALETTE (Green theme) ──────────────────────────────────────────────── */
const C = {
  bg: '#020d05', bgCard: '#0a1a0e',
  green: '#22c55e', greenL: '#4ade80', greenD: '#15803d', greenDim: '#0d3320',
  cyan: '#06b6d4', cyanL: '#22d3ee', cyanGlow: 'rgba(6,182,212,0.35)',
  orange: '#f59e0b', orangeL: '#fbbf24', orangeGlow: 'rgba(245,158,11,0.35)',
  gold: '#f59e0b', goldL: '#fbbf24',
  red: '#ef4444', redL: '#f87171',
  text: '#ffffff', muted: '#6b7280', dim: '#374151',
  hexNeutral: '#0f2f1a', hexBorder: 'rgba(34,197,94,0.25)',
  hexHover: 'rgba(74,222,128,0.15)',
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

/* ─── HEXAGON GRID MATH ──────────────────────────────────────────────────── */
const ROWS = [1, 2, 3, 4, 5, 6, 7];
const TOTAL_HEXES = ROWS.reduce((a, b) => a + b, 0); // 28

function buildHexGrid(cx, startY, hexW, hexH) {
  const cells = [];
  let id = 0;
  const vGap = hexH * 0.75;
  for (let row = 0; row < ROWS.length; row++) {
    const count = ROWS[row];
    const rowW = count * hexW;
    const sx = cx - rowW / 2 + hexW / 2;
    for (let col = 0; col < count; col++) {
      cells.push({
        id: id++, row, col,
        x: sx + col * hexW,
        y: startY + row * vGap,
        owner: null, // null | 'player' | 'bot'
      });
    }
  }
  return cells;
}

function drawHexagon(ctx, cx, cy, size, fill, stroke, lineW = 1.5, glow = null) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = Math.PI / 6 + (Math.PI / 3) * i;
    const x = cx + size * Math.cos(angle);
    const y = cy + size * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 18; }
  ctx.fillStyle = fill; ctx.fill();
  ctx.shadowBlur = 0;
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineW; ctx.stroke(); }
}

function hexContains(cx, cy, size, px, py) {
  // Approximate hit test
  const dx = Math.abs(px - cx), dy = Math.abs(py - cy);
  if (dx > size || dy > size) return false;
  return dx * 0.5 + dy * 0.866 <= size * 0.866;
}

/* ─── FALLBACK + DB QUESTIONS ────────────────────────────────────────────── */
const FALLBACK_QS = [
  { q: 'Aké je hlavné mesto Slovenska?', answers: ['Bratislava', 'Košice', 'Žilina', 'Prešov'], correct: 0, difficulty: 1 },
  { q: 'Koľko planét má Slnečná sústava?', answers: ['7', '8', '9', '10'], correct: 1, difficulty: 1 },
  { q: 'Kto napísal Romea a Júliu?', answers: ['Dickens', 'Shakespeare', 'Tolstoj', 'Hemingway'], correct: 1, difficulty: 1 },
  { q: 'V ktorom roku padol Berlínsky múr?', answers: ['1987', '1988', '1989', '1990'], correct: 2, difficulty: 2 },
  { q: 'Aký je chemický vzorec vody?', answers: ['CO2', 'H2O', 'NaCl', 'O2'], correct: 1, difficulty: 1 },
  { q: 'Ktorá krajina má najviac obyvateľov?', answers: ['USA', 'India', 'Čína', 'Rusko'], correct: 1, difficulty: 2 },
  { q: 'Aký je najväčší oceán?', answers: ['Atlantický', 'Indický', 'Tichý', 'Sev. ľadový'], correct: 2, difficulty: 2 },
  { q: 'Kto namaľoval Monu Lízu?', answers: ['Picasso', 'Van Gogh', 'Da Vinci', 'Michelangelo'], correct: 2, difficulty: 1 },
  { q: 'Koľko minút má hodina?', answers: ['30', '45', '60', '90'], correct: 2, difficulty: 1 },
  { q: 'Ktoré zviera je najrýchlejšie?', answers: ['Lev', 'Gepard', 'Kôň', 'Antilopa'], correct: 1, difficulty: 1 },
  { q: 'Aké je hlavné mesto Francúzska?', answers: ['Lyon', 'Marseille', 'Paríž', 'Nice'], correct: 2, difficulty: 1 },
  { q: 'Koľko kostí má dospelý človek?', answers: ['106', '156', '206', '256'], correct: 2, difficulty: 2 },
  { q: 'Ktorý prvok má symbol Fe?', answers: ['Fluór', 'Fosfor', 'Železo', 'Francium'], correct: 2, difficulty: 2 },
  { q: 'Aký je najvyšší vrch sveta?', answers: ['K2', 'Everest', 'Kilimandžáro', 'Mont Blanc'], correct: 1, difficulty: 1 },
  { q: 'Koľko dní má prestupný rok?', answers: ['364', '365', '366', '367'], correct: 2, difficulty: 2 },
  { q: 'Kde sa konali OH 2024?', answers: ['Tokyo', 'Paríž', 'Los Angeles', 'Londýn'], correct: 1, difficulty: 2 },
  { q: 'Koľko chromozómov má človek?', answers: ['23', '44', '46', '48'], correct: 2, difficulty: 3 },
  { q: 'Kto vynašiel žiarovku?', answers: ['Tesla', 'Edison', 'Bell', 'Watt'], correct: 1, difficulty: 2 },
  { q: 'V ktorom roku pristál človek na Mesiaci?', answers: ['1965', '1967', '1969', '1971'], correct: 2, difficulty: 2 },
  { q: 'Koľko hráčov má futbalový tím?', answers: ['9', '10', '11', '12'], correct: 2, difficulty: 1 },
  { q: 'Aký je symbol zlata?', answers: ['Ag', 'Au', 'Zn', 'Cu'], correct: 1, difficulty: 2 },
  { q: 'Koľko zubov má dospelý človek?', answers: ['28', '30', '32', '34'], correct: 2, difficulty: 2 },
  { q: 'Koľko sŕdc má chobotnica?', answers: ['1', '2', '3', '4'], correct: 2, difficulty: 3 },
  { q: 'Aký je vzorec Einsteinovej rovnice?', answers: ['E=mc²', 'F=ma', 'a²+b²=c²', 'PV=nRT'], correct: 0, difficulty: 3 },
  { q: 'Koľko litrov krvi má dospelý človek?', answers: ['3', '5', '7', '9'], correct: 1, difficulty: 3 },
  { q: 'Ktorá planéta je najbližšie k Slnku?', answers: ['Venuša', 'Merkúr', 'Mars', 'Zem'], correct: 1, difficulty: 2 },
  { q: 'Koľko nôh má pavúk?', answers: ['6', '8', '10', '12'], correct: 1, difficulty: 1 },
  { q: 'Kto zložil Deviatú symfóniu?', answers: ['Mozart', 'Bach', 'Beethoven', 'Chopin'], correct: 2, difficulty: 3 },
  { q: 'Koľko farieb má dúha?', answers: ['5', '6', '7', '8'], correct: 2, difficulty: 1 },
  { q: 'V ktorom roku vzniklo Československo?', answers: ['1915', '1918', '1920', '1925'], correct: 1, difficulty: 3 },
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
  } catch (e) { console.warn('Quiz DB load failed:', e); }
  return FALLBACK_QS;
}

const ROUND_TIME = 12;

/* ─── BOT AI ─────────────────────────────────────────────────────────────── */
class Bot {
  constructor(difficulty = 'medium') {
    const d = { easy: { speed: [4, 8], accuracy: 0.45 }, medium: { speed: [2.5, 6], accuracy: 0.68 }, hard: { speed: [1, 3.5], accuracy: 0.88 } };
    this.cfg = d[difficulty] || d.medium;
    this.difficulty = difficulty;
  }
  getAnswer(correctIdx) {
    const correct = Math.random() < this.cfg.accuracy;
    const [min, max] = this.cfg.speed;
    const delay = min + Math.random() * (max - min);
    if (correct) return { answer: correctIdx, delay };
    let w; do { w = Math.floor(Math.random() * 4); } while (w === correctIdx);
    return { answer: w, delay };
  }
  pickHex(cells) {
    // Strategic: prefer hexes adjacent to owned ones, else random
    const mine = cells.filter(c => c.owner === 'bot');
    const free = cells.filter(c => c.owner === null);
    if (free.length === 0) return null;
    if (mine.length === 0) {
      // Pick near top row
      const topFree = free.filter(c => c.row <= 1);
      if (topFree.length > 0) return topFree[Math.floor(Math.random() * topFree.length)];
      return free[Math.floor(Math.random() * free.length)];
    }
    // Find free cells adjacent to owned
    const adjacent = free.filter(fc => {
      return mine.some(mc => {
        const dr = Math.abs(fc.row - mc.row);
        const dc = Math.abs(fc.col - mc.col);
        if (dr === 0) return dc === 1;
        if (dr === 1) {
          // Staggered rows: neighbors depend on row size
          return dc <= 1;
        }
        return false;
      });
    });
    if (adjacent.length > 0) return adjacent[Math.floor(Math.random() * adjacent.length)];
    return free[Math.floor(Math.random() * free.length)];
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   QUIZ DUEL GAME – AZ Kvíz Hexagon Style
   ═══════════════════════════════════════════════════════════════════════════ */
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

    // Game state
    this.phase = 'menu'; // menu|countdown|selectHex|question|reveal|result
    this.turn = 'player'; // player | bot
    this.cells = [];
    this.questions = [];
    this.qIndex = 0;
    this.currentHex = null;
    this.myAnswer = null;
    this.botAnswer = null;
    this.timer = ROUND_TIME;
    this._timerInterval = null;
    this._botTimeout = null;
    this.botDifficulty = null;
    this.bot = null;
    this.countdownNum = 3;
    this.hoverHex = null;
    this.reportedQ = new Set();
    this._transitioning = false;
    this.playerScore = 0;
    this.botScore = 0;

    // Animation state
    this.anim = {
      menuA: 0, menuY: 30,
      boardA: 0,
      qA: 0, qY: 20,
      ansH: [0, 0, 0, 0],
      revealA: 0, resultA: 0,
      countdownScale: 0,
      diffH: [0, 0, 0],
      playH: 0, backH: 0, exitH: 0, leaveH: 0, reportH: 0,
      errorFlash: 0,
      hexFlip: 0,
      selectGlow: 0,
    };
    this.hits = {};

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
    clearInterval(this._timerInterval); clearTimeout(this._botTimeout);
    window.removeEventListener('resize', this._resize);
    this.canvas.removeEventListener('mousemove', this._onMove);
    this.canvas.removeEventListener('mousedown', this._onClick);
    gsap.killTweensOf(this.anim);
  }

  setUser(u) { this.user = u; }

  // ── FLOW ───────────────────────────────────────────────────────────────────
  _animateMenu() {
    this.phase = 'menu'; this.anim.menuA = 0; this.anim.menuY = 30;
    gsap.to(this.anim, { menuA: 1, menuY: 0, duration: 0.6, ease: 'back.out(1.4)', delay: 0.1 });
  }

  async _startGame() {
    if (!this.botDifficulty) {
      gsap.fromTo(this.anim, { errorFlash: 1 }, { errorFlash: 0, duration: 0.8 });
      return;
    }
    const mobile = this.W < 600;
    const hexW = mobile ? 46 : 70;
    const hexH = mobile ? 53 : 80;
    const startY = mobile ? 70 : 90;
    this.cells = buildHexGrid(this.W / 2, startY, hexW, hexH);
    this.hexSize = mobile ? 24 : 36;
    const allQ = await loadQuestions();
    this.questions = shuffle(allQ).slice(0, TOTAL_HEXES);
    this.qIndex = 0;
    this.myAnswer = null; this.botAnswer = null;
    this.bot = new Bot(this.botDifficulty);
    this.turn = 'player';
    this.reportedQ = new Set();
    this.playerScore = 0; this.botScore = 0;
    this._transitioning = false;
    gsap.to(this.anim, { menuA: 0, menuY: -30, duration: 0.3 });
    setTimeout(() => this._startCountdown(), 350);
  }

  _startCountdown() {
    this.phase = 'countdown'; this.countdownNum = 3;
    this.anim.boardA = 0;
    gsap.to(this.anim, { boardA: 1, duration: 0.8, delay: 0.2 });
    const tick = () => {
      if (this._dead) return;
      this.anim.countdownScale = 0;
      gsap.fromTo(this.anim, { countdownScale: 2 }, { countdownScale: 1, duration: 0.5, ease: 'back.out(2)' });
      if (this.countdownNum <= 0) { this._startSelectPhase(); return; }
      setTimeout(() => { this.countdownNum--; tick(); }, 1000);
    };
    tick();
  }

  _startSelectPhase() {
    this.phase = 'selectHex';
    this.myAnswer = null; this.botAnswer = null;
    this.currentHex = null;
    this.anim.qA = 0; this.anim.revealA = 0;
    this._transitioning = false;

    if (this.turn === 'bot') {
      // BOT picks a hex after a delay
      const pick = this.bot.pickHex(this.cells);
      if (!pick) { this._showResult(); return; }
      this._botTimeout = setTimeout(() => {
        if (this._dead) return;
        this._selectHex(pick.id);
      }, 800 + Math.random() * 1200);
    }
    // Glow animation for whose turn
    this.anim.selectGlow = 0;
    gsap.to(this.anim, { selectGlow: 1, duration: 0.5, repeat: -1, yoyo: true, ease: 'sine.inOut' });
  }

  _selectHex(hexId) {
    const cell = this.cells.find(c => c.id === hexId);
    if (!cell || cell.owner) return;
    this.currentHex = cell;
    gsap.killTweensOf(this.anim, 'selectGlow');
    this.anim.selectGlow = 0;
    // Reveal hex animation → then question
    this.anim.hexFlip = 0;
    gsap.to(this.anim, { hexFlip: 1, duration: 0.6, ease: 'back.out(1.5)', onComplete: () => {
      if (!this._dead) this._startQuestion();
    }});
  }

  _startQuestion() {
    if (this.qIndex >= this.questions.length) { this._showResult(); return; }
    this.phase = 'question';
    this.myAnswer = null; this.botAnswer = null;
    this.timer = ROUND_TIME;
    this._transitioning = false;
    this.anim.qA = 0; this.anim.qY = 20; this.anim.revealA = 0;
    gsap.to(this.anim, { qA: 1, qY: 0, duration: 0.5, ease: 'back.out(1.2)' });
    for (let i = 0; i < 4; i++) this.anim.ansH[i] = 0;

    // Current turn answers
    const q = this.questions[this.qIndex];
    if (this.turn === 'bot') {
      // Bot answers the question
      const botResult = this.bot.getAnswer(q.correct);
      this._botTimeout = setTimeout(() => {
        if (this._dead || this.phase !== 'question') return;
        this.botAnswer = botResult.answer;
        this._doReveal();
      }, botResult.delay * 1000);
    }

    clearInterval(this._timerInterval);
    this._timerInterval = setInterval(() => {
      if (this._dead || this.phase !== 'question') return;
      this.timer -= 0.1;
      if (this.timer <= 0) { this.timer = 0; clearInterval(this._timerInterval); this._doReveal(); }
    }, 100);
  }

  _submitAnswer(idx) {
    if (this.phase !== 'question' || this.turn !== 'player' || this.myAnswer !== null) return;
    this.myAnswer = idx;
    this._doReveal();
  }

  _doReveal() {
    if (this.phase !== 'question') return;
    clearInterval(this._timerInterval); clearTimeout(this._botTimeout);
    this.phase = 'reveal';
    const q = this.questions[this.qIndex];
    const answer = this.turn === 'player' ? this.myAnswer : this.botAnswer;
    const correct = answer === q.correct;

    if (this.currentHex) {
      if (correct) {
        this.currentHex.owner = this.turn === 'player' ? 'player' : 'bot';
        if (this.turn === 'player') this.playerScore++; else this.botScore++;
      } else {
        // Wrong answer → opponent gets the hex
        this.currentHex.owner = this.turn === 'player' ? 'bot' : 'player';
        if (this.turn === 'player') this.botScore++; else this.playerScore++;
      }
    }

    gsap.to(this.anim, { revealA: 1, duration: 0.5 });
    this.qIndex++;

    setTimeout(() => {
      if (this._dead) return;
      // Check if all hexes filled
      const freeHexes = this.cells.filter(c => c.owner === null).length;
      if (freeHexes === 0 || this.qIndex >= this.questions.length) {
        this._showResult(); return;
      }
      this._transitioning = true;
      gsap.to(this.anim, { qA: 0, qY: -30, duration: 0.3, onComplete: () => {
        if (this._dead) return;
        this.turn = this.turn === 'player' ? 'bot' : 'player';
        setTimeout(() => { if (!this._dead) this._startSelectPhase(); }, 200);
      }});
    }, 2000);
  }

  _showResult() {
    this.phase = 'result'; this.anim.resultA = 0;
    gsap.to(this.anim, { resultA: 1, duration: 0.6 });
  }

  _leaveGame() { this.onBack(); }

  async _reportQuestion() {
    if (this.qIndex <= 0) return;
    const qi = this.qIndex - 1;
    const q = this.questions[qi];
    if (!q?.id || this.reportedQ.has(qi)) return;
    this.reportedQ.add(qi);
    try { await supabase.from('quiz_questions').update({ reported: true }).eq('id', q.id); } catch(e) {}
  }

  // ── INPUT ──────────────────────────────────────────────────────────────────
  _resize() {
    const r = this.canvas.getBoundingClientRect();
    this.W = r.width || window.innerWidth; this.H = r.height || window.innerHeight;
    this.canvas.width = this.W * this.dpr; this.canvas.height = this.H * this.dpr;
    // Rebuild grid if in game
    if (this.cells.length > 0) {
      const mobile = this.W < 600;
      const hexW = mobile ? 46 : 70;
      const hexH = mobile ? 53 : 80;
      const startY = mobile ? 70 : 90;
      this.hexSize = mobile ? 24 : 36;
      const owners = this.cells.map(c => c.owner);
      this.cells = buildHexGrid(this.W / 2, startY, hexW, hexH);
      owners.forEach((o, i) => { if (this.cells[i]) this.cells[i].owner = o; });
    }
  }
  _pos(e) {
    const r = this.canvas.getBoundingClientRect();
    if (e.touches) return { x: e.touches[0].clientX - r.left, y: e.touches[0].clientY - r.top };
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  _hit(p, a) { return a && p.x >= a.x && p.x <= a.x + a.w && p.y >= a.y && p.y <= a.y + a.h; }

  _onMove(e) {
    const p = this._pos(e);
    // Hex hover
    this.hoverHex = null;
    if (this.phase === 'selectHex' && this.turn === 'player') {
      for (const c of this.cells) {
        if (!c.owner && hexContains(c.x, c.y, this.hexSize, p.x, p.y)) {
          this.hoverHex = c.id; break;
        }
      }
    }
    for (let i = 0; i < 4; i++) gsap.to(this.anim.ansH, { [i]: this._hit(p, this.hits[`a${i}`]) ? 1 : 0, duration: 0.15 });
    for (let i = 0; i < 3; i++) gsap.to(this.anim.diffH, { [i]: this._hit(p, this.hits[`d${i}`]) ? 1 : 0, duration: 0.15 });
    gsap.to(this.anim, { playH: this._hit(p, this.hits.play) ? 1 : 0, duration: 0.15 });
    gsap.to(this.anim, { backH: this._hit(p, this.hits.back) ? 1 : 0, duration: 0.15 });
    gsap.to(this.anim, { exitH: this._hit(p, this.hits.exit) ? 1 : 0, duration: 0.15 });
    gsap.to(this.anim, { leaveH: this._hit(p, this.hits.leave) ? 1 : 0, duration: 0.15 });
    gsap.to(this.anim, { reportH: this._hit(p, this.hits.report) ? 1 : 0, duration: 0.15 });
    const hexHov = this.hoverHex !== null;
    const btnHov = Object.values(this.hits).some(a => a && this._hit(p, a));
    this.canvas.style.cursor = (hexHov || btnHov) ? 'pointer' : 'default';
  }

  _onClick(e) {
    const p = this._pos(e);
    if (this.phase === 'menu') {
      if (this._hit(p, this.hits.back)) { this.onBack(); return; }
      if (this._hit(p, this.hits.play)) this._startGame();
      const diffs = ['easy', 'medium', 'hard'];
      for (let i = 0; i < 3; i++) { if (this._hit(p, this.hits[`d${i}`])) this.botDifficulty = diffs[i]; }
    }
    if (this.phase === 'selectHex' && this.turn === 'player') {
      for (const c of this.cells) {
        if (!c.owner && hexContains(c.x, c.y, this.hexSize, p.x, p.y)) {
          this._selectHex(c.id); break;
        }
      }
    }
    if (this.phase === 'question' && this.turn === 'player') {
      for (let i = 0; i < 4; i++) { if (this._hit(p, this.hits[`a${i}`])) this._submitAnswer(i); }
    }
    if (this.phase === 'question' || this.phase === 'reveal') {
      if (this._hit(p, this.hits.leave)) this._leaveGame();
      if (this._hit(p, this.hits.report)) this._reportQuestion();
    }
    if (this.phase === 'selectHex') {
      if (this._hit(p, this.hits.leave)) this._leaveGame();
    }
    if (this.phase === 'result') {
      if (this._hit(p, this.hits.exit)) this.onBack();
      if (this._hit(p, this.hits.play)) this._startGame();
    }
  }

  // ── LOOP & DRAW ────────────────────────────────────────────────────────────
  _loop() {
    if (this._dead) return;
    requestAnimationFrame(() => this._loop());
    this._time += 0.016;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this._draw();
  }

  _draw() {
    const { ctx, W, H } = this;
    // Green-themed background
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#010d04'); bg.addColorStop(0.5, '#031a08'); bg.addColorStop(1, '#010d04');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    if (this.phase === 'menu') this._drawMenu();
    else if (this.phase === 'countdown') { this._drawBoard(); this._drawCountdown(); }
    else if (this.phase === 'selectHex') { this._drawScoreboard(); this._drawBoard(); this._drawSelectUI(); }
    else if ((this.phase === 'question' || this.phase === 'reveal') && !this._transitioning) {
      this._drawScoreboard(); this._drawBoard(); this._drawQuestion();
    }
    else if (this.phase === 'result') { this._drawBoard(); this._drawResult(); }
  }

  _drawMenu() {
    const { ctx, W, anim } = this;
    const mobile = W < 600; const cx = W / 2;
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

    // Hex icon
    const iconY = mobile ? 80 : 95;
    drawHexagon(ctx, cx, iconY, mobile ? 28 : 38, C.greenD, C.green, 2, 'rgba(34,197,94,0.3)');
    ctx.font = `900 ${mobile ? 16 : 22}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = C.greenL; ctx.fillText('⬡', cx, iconY + 1);

    // Title
    const titleY = iconY + (mobile ? 50 : 60);
    ctx.font = `900 ${mobile ? 28 : 42}px Inter, system-ui, sans-serif`;
    ctx.shadowColor = C.green; ctx.shadowBlur = 25; ctx.fillStyle = C.greenL;
    ctx.fillText('KVÍZ DUEL', cx, titleY); ctx.shadowBlur = 0;
    ctx.font = `500 ${mobile ? 11 : 14}px Inter, system-ui, sans-serif`; ctx.fillStyle = C.muted;
    ctx.fillText('AZ Kvíz štýl • Hexagonová mriežka • Obsaď cestu!', cx, titleY + (mobile ? 28 : 35));

    // Rules
    const rulesY = titleY + (mobile ? 55 : 70);
    ctx.font = `500 ${mobile ? 10 : 12}px Inter, system-ui, sans-serif`; ctx.fillStyle = hex2rgba(C.greenL, 0.6);
    const rules = ['🟦 Ty spájaš zľava → doprava', '🟧 BOT spája zhora → nadol', '✅ Správna odpoveď = tvoj hex', '❌ Zlá odpoveď = súperov hex'];
    rules.forEach((r, i) => ctx.fillText(r, cx, rulesY + i * (mobile ? 18 : 22)));

    // Difficulty
    const diffs = ['Ľahký', 'Stredný', 'Ťažký'];
    const diffKeys = ['easy', 'medium', 'hard'];
    const diffCols = [C.greenL, C.gold, C.red];
    const dbw = mobile ? 82 : 100, dbh = 38, dgap = 8;
    const dtotalW = dbw * 3 + dgap * 2;
    const dsy = rulesY + 4 * (mobile ? 18 : 22) + (mobile ? 18 : 25);
    const errFlash = anim.errorFlash;
    ctx.font = '600 11px Inter, system-ui, sans-serif';
    ctx.fillStyle = errFlash > 0 ? `rgba(239,68,68,${errFlash})` : hex2rgba(C.text, 0.4);
    ctx.fillText(this.botDifficulty ? 'Obtiažnosť BOTa' : '⚠️ Vyber obtiažnosť!', cx, dsy - 14);

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

    // Play
    const pbw = 220, pbh = 52;
    const pb = { x: cx - pbw/2, y: dsy + dbh + 30, w: pbw, h: pbh };
    this.hits.play = pb;
    const canPlay = !!this.botDifficulty;
    ctx.shadowColor = canPlay ? C.green : '#222'; ctx.shadowBlur = canPlay ? (10 + anim.playH * 18) : 0;
    const g = ctx.createLinearGradient(pb.x, pb.y, pb.x, pb.y + pbh);
    if (canPlay) { g.addColorStop(0, anim.playH ? C.greenL : C.green); g.addColorStop(1, anim.playH ? C.green : C.greenD); }
    else { g.addColorStop(0, '#333'); g.addColorStop(1, '#222'); }
    rr(ctx, pb.x, pb.y, pbw, pbh, 16); ctx.fillStyle = g; ctx.fill(); ctx.shadowBlur = 0;
    ctx.font = '800 18px Inter, system-ui, sans-serif'; ctx.fillStyle = canPlay ? '#000' : '#555';
    ctx.fillText('⬡ HRAŤ vs BOT', cx, pb.y + pbh / 2);
    ctx.restore();
  }

  _drawBoard() {
    const { ctx, anim } = this;
    ctx.save(); ctx.globalAlpha = anim.boardA;
    for (const c of this.cells) {
      let fill, stroke, glow = null, lw = 1.5;
      const isHover = this.hoverHex === c.id;
      const isSelected = this.currentHex && this.currentHex.id === c.id;

      if (c.owner === 'player') {
        fill = hex2rgba(C.cyan, 0.35); stroke = C.cyan; glow = C.cyanGlow; lw = 2;
      } else if (c.owner === 'bot') {
        fill = hex2rgba(C.orange, 0.35); stroke = C.orange; glow = C.orangeGlow; lw = 2;
      } else if (isSelected) {
        fill = hex2rgba(C.greenL, 0.3); stroke = C.greenL; glow = 'rgba(74,222,128,0.4)'; lw = 2.5;
      } else if (isHover) {
        fill = C.hexHover; stroke = C.greenL; lw = 2;
      } else {
        fill = C.hexNeutral; stroke = C.hexBorder;
      }
      drawHexagon(ctx, c.x, c.y, this.hexSize, fill, stroke, lw, glow);

      // Label
      if (c.owner === 'player') {
        ctx.font = `700 ${this.hexSize > 30 ? 14 : 10}px Inter, system-ui, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = C.cyanL;
        ctx.fillText('Ty', c.x, c.y);
      } else if (c.owner === 'bot') {
        ctx.font = `700 ${this.hexSize > 30 ? 14 : 10}px Inter, system-ui, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = C.orangeL;
        ctx.fillText('🤖', c.x, c.y);
      }
    }
    ctx.restore();
  }

  _drawScoreboard() {
    const { ctx, W } = this;
    const mobile = W < 600; const y = mobile ? 18 : 24;
    ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    // Player side
    ctx.font = `700 ${mobile ? 12 : 14}px Inter, system-ui, sans-serif`; ctx.fillStyle = C.cyanL;
    ctx.fillText('Ty', W/2 - (mobile ? 55 : 70), y);
    ctx.font = `900 ${mobile ? 18 : 22}px Inter, system-ui, sans-serif`; ctx.fillStyle = '#fff';
    ctx.fillText(`${this.playerScore}`, W/2 - (mobile ? 30 : 40), y);
    // VS
    ctx.font = `700 ${mobile ? 10 : 13}px Inter, system-ui, sans-serif`; ctx.fillStyle = C.dim;
    ctx.fillText('vs', W/2, y);
    // Bot side
    ctx.fillStyle = '#fff'; ctx.font = `900 ${mobile ? 18 : 22}px Inter, system-ui, sans-serif`;
    ctx.fillText(`${this.botScore}`, W/2 + (mobile ? 30 : 40), y);
    ctx.font = `700 ${mobile ? 12 : 14}px Inter, system-ui, sans-serif`; ctx.fillStyle = C.orangeL;
    ctx.fillText('🤖 BOT', W/2 + (mobile ? 65 : 80), y);
  }

  _drawSelectUI() {
    const { ctx, W, H, anim } = this;
    const mobile = W < 600;
    const cx = W / 2;
    // Turn indicator
    const boardBottom = this.cells[this.cells.length - 1]?.y + this.hexSize + 20 || H * 0.6;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const glowAlpha = 0.5 + anim.selectGlow * 0.5;
    if (this.turn === 'player') {
      ctx.font = `700 ${mobile ? 14 : 18}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = `rgba(6,182,212,${glowAlpha})`;
      ctx.fillText('🎯 Vyber si hexagon!', cx, boardBottom);
    } else {
      ctx.font = `700 ${mobile ? 14 : 18}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = `rgba(245,158,11,${glowAlpha})`;
      ctx.fillText('🤖 BOT vyberá...', cx, boardBottom);
    }
    // Leave button
    const lbw = mobile ? 80 : 100, lbh = 30;
    const leave = { x: cx - lbw/2, y: boardBottom + 25, w: lbw, h: lbh };
    this.hits.leave = leave;
    rr(ctx, leave.x, leave.y, lbw, lbh, 10);
    ctx.fillStyle = anim.leaveH ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.03)'; ctx.fill();
    rr(ctx, leave.x, leave.y, lbw, lbh, 10);
    ctx.strokeStyle = anim.leaveH ? C.red : 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.font = `600 ${mobile ? 10 : 11}px Inter, system-ui, sans-serif`; ctx.fillStyle = anim.leaveH ? C.redL : C.dim;
    ctx.fillText('🚪 Odísť', leave.x + lbw/2, leave.y + lbh/2);
  }

  _drawCountdown() {
    const { ctx, W, H, anim } = this;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.save(); ctx.translate(W/2, H/2);
    ctx.scale(anim.countdownScale, anim.countdownScale);
    ctx.font = '900 100px Inter, system-ui, sans-serif'; ctx.fillStyle = C.greenL;
    ctx.shadowColor = C.green; ctx.shadowBlur = 30;
    ctx.fillText(this.countdownNum > 0 ? `${this.countdownNum}` : 'GO!', 0, 0);
    ctx.restore();
  }

  _drawQuestion() {
    const { ctx, W, H, anim } = this;
    const mobile = W < 600; const cx = W / 2;
    const q = this.questions[this.qIndex - (this.phase === 'reveal' ? 1 : 0)] || this.questions[this.qIndex];
    if (!q) return;

    const boardBottom = this.cells[this.cells.length - 1]?.y + this.hexSize + 10 || H * 0.55;

    ctx.save(); ctx.globalAlpha = anim.qA; ctx.translate(0, anim.qY);

    // Turn label
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const turnColor = this.turn === 'player' ? C.cyanL : C.orangeL;
    ctx.font = `600 ${mobile ? 10 : 12}px Inter, system-ui, sans-serif`; ctx.fillStyle = turnColor;
    ctx.fillText(this.turn === 'player' ? '🟦 Tvoj ťah' : '🟧 BOT odpovedá', cx, boardBottom - 2);

    // Timer
    const tw = mobile ? Math.min(W - 40, 180) : 200, th = 4;
    const ty = boardBottom + 10;
    const pct = Math.max(0, this.timer / ROUND_TIME);
    rr(ctx, cx - tw/2, ty, tw, th, 3); ctx.fillStyle = '#1a1a1a'; ctx.fill();
    if (pct > 0) { rr(ctx, cx - tw/2, ty, tw * pct, th, 3); ctx.fillStyle = pct > 0.3 ? C.green : C.red; ctx.fill(); }
    ctx.font = `700 ${mobile ? 10 : 12}px Inter, system-ui, sans-serif`; ctx.fillStyle = pct > 0.3 ? C.muted : C.red;
    ctx.fillText(`${Math.ceil(this.timer)}s`, cx, ty + 14);

    // Question card
    const qcw = Math.min(W - 24, 460), qch = mobile ? 60 : 75;
    const qcy = ty + 28;
    rr(ctx, cx - qcw/2, qcy, qcw, qch, 14); ctx.fillStyle = hex2rgba(C.green, 0.06); ctx.fill();
    rr(ctx, cx - qcw/2, qcy, qcw, qch, 14);
    ctx.strokeStyle = hex2rgba(C.green, 0.2); ctx.lineWidth = 1; ctx.stroke();
    ctx.font = `700 ${mobile ? 13 : 16}px Inter, system-ui, sans-serif`; ctx.fillStyle = C.text;
    const words = q.q.split(' '); let line = '', lines = [];
    for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > qcw - 30 && line) { lines.push(line); line = w; } else line = t; }
    if (line) lines.push(line);
    const lh = mobile ? 18 : 22;
    lines.forEach((l, i) => ctx.fillText(l, cx, qcy + qch/2 - (lines.length - 1) * lh/2 + i * lh));

    // Answers (2x2)
    const abw = mobile ? (W - 24) / 2 - 4 : 210;
    const abh = mobile ? 40 : 48;
    const agap = 6;
    const astartY = qcy + qch + 10;
    const astartX = cx - abw - agap/2;
    const labels = ['A', 'B', 'C', 'D'];
    const ansColors = ['#3b82f6', '#a855f7', '#f59e0b', '#22c55e'];

    for (let i = 0; i < 4; i++) {
      const col = i % 2, row = Math.floor(i / 2);
      const ax = astartX + col * (abw + agap), ay = astartY + row * (abh + agap);
      this.hits[`a${i}`] = { x: ax, y: ay, w: abw, h: abh };
      const hover = this.anim.ansH[i];
      const isCorrect = i === q.correct;
      const answer = this.turn === 'player' ? this.myAnswer : this.botAnswer;
      const isMyPick = answer === i;
      const revealing = this.phase === 'reveal';
      let bgColor, borderColor, textColor;
      if (revealing) {
        if (isCorrect) { bgColor = hex2rgba(C.green, 0.25); borderColor = C.green; textColor = C.greenL; }
        else if (isMyPick) { bgColor = hex2rgba(C.red, 0.2); borderColor = C.red; textColor = C.redL; }
        else { bgColor = 'rgba(255,255,255,0.02)'; borderColor = 'rgba(255,255,255,0.05)'; textColor = C.dim; }
      } else if (isMyPick) { bgColor = hex2rgba(ansColors[i], 0.2); borderColor = ansColors[i]; textColor = '#fff'; }
      else { bgColor = `rgba(255,255,255,${0.03 + hover * 0.05})`; borderColor = `rgba(255,255,255,${0.08 + hover * 0.15})`; textColor = `rgba(255,255,255,${0.7 + hover * 0.3})`; }
      rr(ctx, ax, ay, abw, abh, 12); ctx.fillStyle = bgColor; ctx.fill();
      rr(ctx, ax, ay, abw, abh, 12); ctx.strokeStyle = borderColor; ctx.lineWidth = revealing && isCorrect ? 2 : 1; ctx.stroke();
      ctx.font = `700 ${mobile ? 12 : 14}px Inter, system-ui, sans-serif`; ctx.fillStyle = textColor;
      ctx.fillText(`${labels[i]}: ${q.answers[i]}`, ax + abw/2, ay + abh/2);
    }

    // Leave + Report
    const btnY = astartY + 2 * (abh + agap) + 8;
    const lbw = mobile ? 75 : 95, lbh = 28;
    const leave = { x: cx - lbw - 4, y: btnY, w: lbw, h: lbh };
    this.hits.leave = leave;
    rr(ctx, leave.x, leave.y, lbw, lbh, 10);
    ctx.fillStyle = anim.leaveH ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.03)'; ctx.fill();
    rr(ctx, leave.x, leave.y, lbw, lbh, 10);
    ctx.strokeStyle = anim.leaveH ? C.red : 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.font = `600 ${mobile ? 9 : 10}px Inter, system-ui, sans-serif`; ctx.fillStyle = anim.leaveH ? C.redL : C.dim;
    ctx.fillText('🚪 Odísť', leave.x + lbw/2, leave.y + lbh/2);

    const qi = this.qIndex - (this.phase === 'reveal' ? 1 : 0);
    const reported = this.reportedQ.has(qi);
    const report = { x: cx + 4, y: btnY, w: lbw, h: lbh };
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
    ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(0, 0, W, H);
    const cx = W/2, cy = H/2;
    const pw = Math.min(400, W - 24), ph = mobile ? 320 : 340;
    const px = cx - pw/2, py = cy - ph/2;
    rr(ctx, px, py, pw, ph, 24);
    const bg = ctx.createLinearGradient(px, py, px, py + ph);
    bg.addColorStop(0, '#071a0a'); bg.addColorStop(1, '#020d04');
    ctx.fillStyle = bg; ctx.fill();
    const won = this.playerScore > this.botScore; const tied = this.playerScore === this.botScore;
    const borderC = won ? C.green : (tied ? C.gold : C.red);
    rr(ctx, px, py, pw, ph, 24); ctx.strokeStyle = borderC; ctx.lineWidth = 2; ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `900 ${mobile ? 28 : 34}px Inter, system-ui, sans-serif`;
    ctx.shadowColor = borderC; ctx.shadowBlur = 20; ctx.fillStyle = borderC;
    ctx.fillText(won ? '🏆 VÝHRA!' : (tied ? '🤝 REMÍZA' : '😞 PREHRA'), cx, py + 55); ctx.shadowBlur = 0;

    // Scores
    ctx.font = `700 ${mobile ? 13 : 16}px Inter, system-ui, sans-serif`; ctx.fillStyle = C.cyanL;
    ctx.fillText('Ty', cx - 60, py + 100); ctx.fillStyle = C.orangeL; ctx.fillText('BOT', cx + 60, py + 100);
    ctx.font = `900 ${mobile ? 36 : 44}px Inter, system-ui, sans-serif`; ctx.fillStyle = '#fff';
    ctx.fillText(`${this.playerScore}`, cx - 60, py + 145); ctx.fillText(`${this.botScore}`, cx + 60, py + 145);
    ctx.font = '700 20px Inter, system-ui, sans-serif'; ctx.fillStyle = C.dim; ctx.fillText(':', cx, py + 140);

    ctx.font = `500 ${mobile ? 11 : 13}px Inter, system-ui, sans-serif`; ctx.fillStyle = C.muted;
    ctx.fillText(`${this.playerScore + this.botScore} hexagonov obsadených z ${TOTAL_HEXES}`, cx, py + 185);

    // Buttons
    const bbw = 155, bbh = 42;
    const pb = { x: cx - bbw - 6, y: py + ph - 60, w: bbw, h: bbh };
    this.hits.play = pb;
    rr(ctx, pb.x, pb.y, bbw, bbh, 14);
    ctx.fillStyle = hex2rgba(C.green, 0.15 + anim.playH * 0.15); ctx.fill();
    rr(ctx, pb.x, pb.y, bbw, bbh, 14); ctx.strokeStyle = C.green; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.font = '700 13px Inter, system-ui, sans-serif'; ctx.fillStyle = C.greenL;
    ctx.fillText('🔄 Hrať znova', pb.x + bbw/2, pb.y + bbh/2);

    const eb = { x: cx + 6, y: py + ph - 60, w: bbw, h: bbh };
    this.hits.exit = eb;
    rr(ctx, eb.x, eb.y, bbw, bbh, 14);
    ctx.fillStyle = hex2rgba(C.gold, 0.1 + anim.exitH * 0.1); ctx.fill();
    rr(ctx, eb.x, eb.y, bbw, bbh, 14); ctx.strokeStyle = C.gold; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = C.goldL; ctx.fillText('🔙 Menu', eb.x + bbw/2, eb.y + bbh/2);
    ctx.restore();
  }
}
