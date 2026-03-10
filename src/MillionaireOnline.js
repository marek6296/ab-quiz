import gsap from 'gsap';
import { supabase } from './lib/supabase';

const C = {
  bg:'#050505',gold:'#f59e0b',goldL:'#fbbf24',goldD:'#d97706',
  green:'#22c55e',greenL:'#4ade80',red:'#ef4444',redL:'#f87171',
  purple:'#a855f7',purpleL:'#c084fc',blue:'#3b82f6',
  text:'#ffffff',muted:'#737373',dim:'#404040',
};
const hex2rgba=(hex,a)=>{const[r,g,b]=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));return`rgba(${r},${g},${b},${a})`};
function rr(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.lineTo(x+w-r,y);c.arcTo(x+w,y,x+w,y+r,r);c.lineTo(x+w,y+h-r);c.arcTo(x+w,y+h,x+w-r,y+h,r);c.lineTo(x+r,y+h);c.arcTo(x,y+h,x,y+h-r,r);c.lineTo(x,y+r);c.arcTo(x,y,x+r,y,r);c.closePath()}
function shuffle(a){const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]]}return b}

const FALLBACK=[
  {q:'Aké je hlavné mesto Slovenska?',answers:['Bratislava','Praha','Budapešť','Viedeň'],correct:0,d:1},
  {q:'Koľko farieb má dúha?',answers:['5','6','7','8'],correct:2,d:1},
  {q:'Kto namaľoval Monu Lízu?',answers:['Picasso','Van Gogh','Da Vinci','Michelangelo'],correct:2,d:1},
  {q:'Koľko dní má týždeň?',answers:['5','6','7','8'],correct:2,d:1},
  {q:'Aký je chemický symbol zlata?',answers:['Ag','Au','Zn','Cu'],correct:1,d:2},
  {q:'V ktorom roku padol Berlínsky múr?',answers:['1987','1989','1991','1993'],correct:1,d:2},
  {q:'Koľko kostí má dospelý človek?',answers:['206','156','256','306'],correct:0,d:2},
  {q:'Aká je najdlhšia rieka sveta?',answers:['Amazonka','Níl','Yangtze','Dunaj'],correct:1,d:3},
  {q:'Koľko chromozómov má človek?',answers:['44','46','48','50'],correct:1,d:3},
  {q:'Aký je vzorec Einsteinovej rovnice?',answers:['E=mc²','F=ma','a²+b²=c²','PV=nRT'],correct:0,d:3},
  {q:'Koľko sŕdc má chobotnica?',answers:['1','2','3','4'],correct:2,d:3},
  {q:'Kto zložil Deviatú symfóniu?',answers:['Mozart','Bach','Beethoven','Chopin'],correct:2,d:3},
  {q:'Ktoré zviera štekot?',answers:['Mačka','Pes','Krava','Kôň'],correct:1,d:1},
  {q:'Koľko nôh má pavúk?',answers:['6','8','10','12'],correct:1,d:1},
];
async function loadQ(diff){
  try{const{data,error}=await supabase.from('quiz_questions').select('*').eq('reported',false);
    if(!error&&data&&data.length>=10){const mapped=data.map(r=>({q:r.question,answers:[r.answer_a,r.answer_b,r.answer_c,r.answer_d],correct:r.correct_answer,d:r.difficulty}));
      if(diff){const f=mapped.filter(q=>q.d===diff);if(f.length>=8)return f}return mapped}}catch(e){}
  const f=diff?FALLBACK.filter(q=>q.d===diff):FALLBACK;return f.length>=8?f:FALLBACK}

const PRIZES=['100 €','200 €','300 €','500 €','1 000 €','2 000 €','5 000 €','10 000 €',
  '20 000 €','50 000 €','100 000 €','250 000 €','500 000 €','1 000 000 €'];
const TOTAL_Q=14,ROUND_TIME=20,PLAYER_COLORS=['#3b82f6','#ef4444','#22c55e','#f59e0b','#a855f7','#ec4899','#14b8a6','#8b5cf6'];

/**
 * MillionaireOnline – 1v1 real-time Millionaire Battle.
 * Both players see the same question, answer independently.
 * Wrong answer => eliminated. Last standing wins.
 */
export class MillionaireOnline {
  constructor({ canvas, user, profile, game, isHost, onEnd }) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.dpr = window.devicePixelRatio || 1;
    this.user = user; this.profile = profile;
    this.game = game; this.isHost = isHost; this.onEnd = onEnd;
    this.W = 0; this.H = 0; this._dead = false; this._time = 0;

    this.phase = 'waiting'; // waiting|countdown|question|reveal|eliminated|result
    this.round = 0; this.questions = [];
    this.myAnswer = null; this.myAlive = true; this.timer = ROUND_TIME;
    this._timerInterval = null; this.countdownNum = 3;
    this.myPlayerId = null; this.players = []; // [{id,name,score,alive,answer,color}]

    this.myName = profile?.username || user?.email?.split('@')[0] || 'Ty';

    this.anim = { menuA:1,menuY:0,ansH:[0,0,0,0],revealA:0,countdownScale:0,resultA:0,
      timerPulse:0,leaveH:0,exitH:0,playH:0,barA:1 };
    this.hits = {};

    this._resize = this._resize.bind(this);
    this._onMove = this._onMove.bind(this);
    this._onClick = this._onClick.bind(this);
    window.addEventListener('resize', this._resize);
    canvas.addEventListener('mousemove', this._onMove);
    canvas.addEventListener('mousedown', this._onClick);
    canvas.addEventListener('touchstart', e => this._onClick(e), { passive: true });
    this._resize();
    this._init();
  }

  async _init() {
    if (this.isHost) {
      const diff = this.game.difficulty || null;
      const allQ = await loadQ(diff);
      this.questions = shuffle(allQ).slice(0, TOTAL_Q);
      
      await supabase.from('game_sessions').update({
        state: { questions: this.questions, round: 0 },
        status: 'waiting',
      }).eq('id', this.game.id);

      const { data: myP } = await supabase.from('game_players').insert({
        session_id: this.game.id, user_id: this.user.id,
        player_name: this.myName, score: 0, alive: true,
      }).select().single();
      this.myPlayerId = myP?.id;
    } else {
      const { data: g } = await supabase.from('game_sessions')
        .select('*').eq('id', this.game.id).single();
      if (g?.state?.questions) this.questions = g.state.questions;

      const { data: myP } = await supabase.from('game_players').insert({
        session_id: this.game.id, user_id: this.user.id,
        player_name: this.myName, score: 0, alive: true,
      }).select().single();
      this.myPlayerId = myP?.id;

      await supabase.from('game_sessions').update({ status: 'playing' }).eq('id', this.game.id);
    }

    this._subscribeRealtime();
    this._loop();
    await this._checkPlayers();
  }

  async _checkPlayers() {
    const { data } = await supabase.from('game_players')
      .select('*').eq('session_id', this.game.id);
    if (data) {
      this.players = data.map((p, i) => ({
        id: p.id, userId: p.user_id, name: p.player_name || 'Hráč',
        score: p.score || 0, alive: p.alive !== false, answer: null,
        isMe: p.user_id === this.user.id, color: PLAYER_COLORS[i % PLAYER_COLORS.length],
      }));
      if (this.players.length >= 2 && this.phase === 'waiting') this._startCountdown();
    }
  }

  _subscribeRealtime() {
    this._gameCh = supabase.channel(`mill-online-${this.game.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'game_sessions',
        filter: `id=eq.${this.game.id}`,
      }, (payload) => {
        const g = payload.new;
        if (g.status === 'playing' && this.phase === 'waiting') this._checkPlayers();
        if (g.status === 'abandoned') this._oppLeft();
        // Sync round state
        if (g.state?.round !== undefined && g.state.phase === 'reveal' && this.phase === 'question') {
          this._doReveal();
        }
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'game_players',
        filter: `session_id=eq.${this.game.id}`,
      }, (payload) => {
        const p = payload.new;
        if (!p) return;
        if (payload.eventType === 'INSERT' && p.user_id !== this.user.id) {
          this._checkPlayers();
        }
        if (payload.eventType === 'UPDATE') {
          const pl = this.players.find(x => x.id === p.id);
          if (pl) {
            pl.score = p.score || 0;
            pl.alive = p.alive !== false;
            if (p.last_answer !== null && p.last_answer !== undefined) {
              pl.answer = typeof p.last_answer === 'object' ? p.last_answer.answer : p.last_answer;
            }
          }
          // Check if all alive players answered
          if (this.phase === 'question' && this.isHost) {
            const alive = this.players.filter(x => x.alive);
            const answered = alive.filter(x => x.answer !== null && x.answer !== undefined);
            if (answered.length >= alive.length) {
              this._hostTriggerReveal();
            }
          }
        }
      })
      .subscribe();
  }

  _startCountdown() {
    this.phase = 'countdown'; this.countdownNum = 3;
    const t = () => { if (this._dead) return; this.anim.countdownScale = 0;
      gsap.fromTo(this.anim, { countdownScale: 2 }, { countdownScale: 1, duration: 0.5, ease: 'back.out(2)' });
      if (this.countdownNum <= 0) { this._startRound(); return; }
      setTimeout(() => { this.countdownNum--; t(); }, 1000); };
    t();
  }

  _startRound() {
    if (this.round >= this.questions.length) { this._showResult(); return; }
    const alive = this.players.filter(p => p.alive);
    if (alive.length <= 1) { this._showResult(); return; }

    this.phase = 'question'; this.myAnswer = null; this.timer = ROUND_TIME;
    this.anim.revealA = 0; this.anim.ansH = [0, 0, 0, 0];
    this.players.forEach(p => { p.answer = null; });

    // Reset all players' last_answer
    if (this.myPlayerId) {
      supabase.from('game_players').update({ last_answer: null }).eq('id', this.myPlayerId).then();
    }

    clearInterval(this._timerInterval);
    this._timerInterval = setInterval(() => {
      if (this._dead || this.phase !== 'question') return;
      this.timer -= 0.1;
      if (this.timer <= 3 && this.timer > 0) { this.anim.timerPulse = 1; gsap.to(this.anim, { timerPulse: 0, duration: 0.3 }); }
      if (this.timer <= 0) {
        this.timer = 0; clearInterval(this._timerInterval);
        if (this.myAnswer === null && this.myAlive) this._submitAnswer(-1); // timeout
        // Host triggers reveal after timeout
        if (this.isHost) setTimeout(() => { if (this.phase === 'question') this._hostTriggerReveal(); }, 500);
      }
    }, 100);
  }

  async _submitAnswer(idx) {
    if (this.phase !== 'question' || this.myAnswer !== null || !this.myAlive) return;
    this.myAnswer = idx;
    const me = this.players.find(p => p.isMe);
    if (me) me.answer = idx;

    const q = this.questions[this.round];
    const correct = idx === q.correct;
    if (correct && me) me.score++;

    await supabase.from('game_players').update({
      last_answer: { answer: idx, correct },
      score: correct ? (me?.score || 0) : (me?.score || 0),
    }).eq('id', this.myPlayerId);
  }

  async _hostTriggerReveal() {
    if (!this.isHost || this.phase !== 'question') return;
    await supabase.from('game_sessions').update({
      state: { ...this.game.state, questions: this.questions, round: this.round, phase: 'reveal' },
    }).eq('id', this.game.id);
    this._doReveal();
  }

  _doReveal() {
    if (this.phase !== 'question') return;
    clearInterval(this._timerInterval);
    this.phase = 'reveal';
    const q = this.questions[this.round];
    gsap.to(this.anim, { revealA: 1, duration: 0.5 });

    // Eliminate wrong answers
    this.players.forEach(p => {
      if (!p.alive) return;
      if (p.answer !== q.correct) {
        p.alive = false;
        if (p.isMe) {
          this.myAlive = false;
          supabase.from('game_players').update({ alive: false }).eq('id', this.myPlayerId).then();
        }
      }
    });

    this.round++;
    setTimeout(() => {
      if (this._dead) return;
      // Reset phase for next round
      if (this.isHost) {
        supabase.from('game_sessions').update({
          state: { ...this.game.state, questions: this.questions, round: this.round, phase: 'question' },
        }).eq('id', this.game.id).then();
      }
      this._startRound();
    }, 2500);
  }

  _showResult() {
    this.phase = 'result'; this.anim.resultA = 0;
    gsap.to(this.anim, { resultA: 1, duration: 0.6 });
    if (this.isHost) supabase.from('game_sessions').update({ status: 'finished' }).eq('id', this.game.id).then();
  }

  _leaveGame() {
    supabase.from('game_sessions').update({ status: 'abandoned' }).eq('id', this.game.id).then();
    this.destroy(); this.onEnd();
  }

  _oppLeft() {
    this._showResult();
  }

  _resize() {
    const r = this.canvas.getBoundingClientRect();
    this.W = r.width || window.innerWidth; this.H = r.height || window.innerHeight;
    this.canvas.width = this.W * this.dpr; this.canvas.height = this.H * this.dpr;
  }
  _pos(e) { const r = this.canvas.getBoundingClientRect(); if (e.touches) return { x: e.touches[0].clientX - r.left, y: e.touches[0].clientY - r.top }; return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  _hit(p, a) { return a && p.x >= a.x && p.x <= a.x + a.w && p.y >= a.y && p.y <= a.y + a.h; }

  _onMove(e) {
    const p = this._pos(e);
    for (let i = 0; i < 4; i++) gsap.to(this.anim, { [`ansH[${i}]`]: this._hit(p, this.hits[`a${i}`]) ? 1 : 0, duration: 0.15 });
    ['leaveH', 'exitH', 'playH'].forEach(k =>
      gsap.to(this.anim, { [k]: this._hit(p, this.hits[k.replace('H', '')]) ? 1 : 0, duration: 0.15 }));
    this.canvas.style.cursor = ['a0', 'a1', 'a2', 'a3', 'leave', 'exit', 'play'].some(k => this._hit(p, this.hits[k])) ? 'pointer' : 'default';
  }

  _onClick(e) {
    const p = this._pos(e);
    if (this.phase === 'question' && this.myAlive && this.myAnswer === null) {
      for (let i = 0; i < 4; i++) if (this._hit(p, this.hits[`a${i}`])) { this._submitAnswer(i); break; }
    }
    if (this.phase === 'question' || this.phase === 'reveal') {
      if (this._hit(p, this.hits.leave)) this._leaveGame();
    }
    if (this.phase === 'result') {
      if (this._hit(p, this.hits.exit)) { this.destroy(); this.onEnd(); }
    }
  }

  _loop() { if (this._dead) return; requestAnimationFrame(() => this._loop()); this._time += 0.016;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); this._draw(); }

  _draw() {
    const { ctx, W, H } = this;
    const mg = ctx.createLinearGradient(0, 0, 0, H);
    mg.addColorStop(0, '#030318'); mg.addColorStop(0.5, '#0a0a2e'); mg.addColorStop(1, '#050520');
    ctx.fillStyle = mg; ctx.fillRect(0, 0, W, H);

    if (this.phase === 'waiting') this._drawWaiting();
    else if (this.phase === 'countdown') { this._drawPlayersBar(); this._drawCD(); }
    else if (this.phase === 'question' || this.phase === 'reveal') { this._drawPlayersBar(); this._drawQuestion(); }
    else if (this.phase === 'result') this._drawResult();
  }

  _drawWaiting() {
    const { ctx, W, H } = this; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '700 24px Inter,system-ui,sans-serif'; ctx.fillStyle = C.purpleL;
    ctx.fillText('Čakám na súpera...', W / 2, H / 2 - 20);
    ctx.font = '400 14px Inter,system-ui,sans-serif'; ctx.fillStyle = C.muted;
    ctx.fillText(`Kód: ${this.game.join_code || ''}`, W / 2, H / 2 + 20);
    ctx.font = '400 12px Inter,system-ui,sans-serif'; ctx.fillStyle = C.dim;
    ctx.fillText(`Hráčov: ${this.players.length}`, W / 2, H / 2 + 50);
  }

  _drawPlayersBar() {
    const { ctx, W } = this; const m = W < 600, y = 12, px = 12;
    ctx.save();
    const barW = Math.min(W - 24, 600), barX = (W - barW) / 2;
    rr(ctx, barX, y, barW, m ? 36 : 42, 12);
    ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fill();
    rr(ctx, barX, y, barW, m ? 36 : 42, 12);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1; ctx.stroke();

    const alive = this.players.filter(p => p.alive);
    const gap = Math.min(barW / Math.max(this.players.length, 2), m ? 110 : 150);
    const sx = barX + gap / 2;
    this.players.forEach((p, i) => {
      const x = sx + i * gap;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `${p.alive ? 700 : 400} ${m ? 10 : 12}px Inter,system-ui,sans-serif`;
      ctx.fillStyle = p.alive ? p.color : C.dim;
      const icon = p.isMe ? '👤' : '🎮';
      const label = p.name.length > 10 ? p.name.slice(0, 8) + '..' : p.name;
      ctx.fillText(`${icon} ${label}`, x, y + (m ? 12 : 14));
      ctx.font = `900 ${m ? 12 : 14}px Inter,system-ui,sans-serif`;
      ctx.fillStyle = p.alive ? '#fff' : C.dim;
      ctx.fillText(`${p.score}`, x, y + (m ? 26 : 30));
      if (!p.alive) { ctx.fillStyle = C.red; ctx.font = `700 ${m ? 8 : 10}px Inter,system-ui,sans-serif`; ctx.fillText('OUT', x, y + (m ? 34 : 38)); }
    });
    ctx.restore();
  }

  _drawCD() {
    const { ctx, W, H, anim } = this; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(anim.countdownScale, anim.countdownScale);
    ctx.font = '900 120px Inter,system-ui,sans-serif'; ctx.fillStyle = C.purple;
    ctx.shadowColor = C.purple; ctx.shadowBlur = 30;
    ctx.fillText(this.countdownNum > 0 ? `${this.countdownNum}` : 'GO!', 0, 0); ctx.restore();
  }

  _drawQuestion() {
    const { ctx, W, H, anim } = this; const m = W < 600, cx = W / 2;
    const q = this.questions[this.phase === 'reveal' ? Math.max(0, this.round - 1) : this.round]; if (!q) return;
    const barH = m ? 50 : 56;

    // Round & prize
    const rn = this.phase === 'reveal' ? this.round : this.round + 1;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `700 ${m ? 12 : 14}px Inter,system-ui,sans-serif`; ctx.fillStyle = C.gold;
    ctx.fillText(`Otázka ${rn}/${TOTAL_Q} • ${PRIZES[Math.min(rn - 1, PRIZES.length - 1)]}`, cx, barH + 12);

    // Timer bar
    const tw = Math.min(W - 40, 300), th = 5, ty = barH + 30;
    const pct = Math.max(0, this.timer / ROUND_TIME);
    rr(ctx, cx - tw / 2, ty, tw, th, 3); ctx.fillStyle = '#1a1a1a'; ctx.fill();
    if (pct > 0) { rr(ctx, cx - tw / 2, ty, tw * pct, th, 3); ctx.fillStyle = pct > 0.3 ? C.purple : C.red; ctx.fill(); }

    // Question card
    const qw = Math.min(W - 24, 520), qh = m ? 70 : 85, qy = ty + 20;
    rr(ctx, cx - qw / 2, qy, qw, qh, 16); ctx.fillStyle = hex2rgba(C.purple, 0.08); ctx.fill();
    rr(ctx, cx - qw / 2, qy, qw, qh, 16); ctx.strokeStyle = hex2rgba(C.purple, 0.25); ctx.lineWidth = 1; ctx.stroke();
    ctx.font = `700 ${m ? 14 : 18}px Inter,system-ui,sans-serif`; ctx.fillStyle = C.text;
    // Word wrap
    const words = q.q.split(' '); let line = '', lines = [];
    for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > qw - 30 && line) { lines.push(line); line = w; } else line = t; }
    if (line) lines.push(line);
    const lh = m ? 20 : 24;
    lines.forEach((l, i) => ctx.fillText(l, cx, qy + qh / 2 - (lines.length - 1) * lh / 2 + i * lh));

    // Answer buttons (2x2 grid)
    const aw = Math.min((qw - 12) / 2, 250), ah = m ? 44 : 52;
    const ay = qy + qh + 14;
    const labels = ['A', 'B', 'C', 'D'];
    for (let i = 0; i < 4; i++) {
      const col = i % 2, row = Math.floor(i / 2);
      const ax = cx - aw - 6 + col * (aw + 12);
      const aby = ay + row * (ah + 10);
      const area = { x: ax, y: aby, w: aw, h: ah };
      this.hits[`a${i}`] = area;
      const hv = this.anim.ansH[i];
      const selected = this.myAnswer === i;
      const isCorrect = this.phase === 'reveal' && i === q.correct;
      const isWrong = this.phase === 'reveal' && selected && i !== q.correct;

      let bg, border;
      if (isCorrect) { bg = hex2rgba(C.green, 0.25); border = C.green; }
      else if (isWrong) { bg = hex2rgba(C.red, 0.25); border = C.red; }
      else if (selected) { bg = hex2rgba(C.purple, 0.2); border = C.purpleL; }
      else { bg = `rgba(255,255,255,${0.03 + hv * 0.06})`; border = `rgba(255,255,255,${0.1 + hv * 0.15})`; }

      rr(ctx, ax, aby, aw, ah, 14); ctx.fillStyle = bg; ctx.fill();
      rr(ctx, ax, aby, aw, ah, 14); ctx.strokeStyle = border; ctx.lineWidth = selected || isCorrect || isWrong ? 2 : 1; ctx.stroke();
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.font = `700 ${m ? 11 : 13}px Inter,system-ui,sans-serif`; ctx.fillStyle = isCorrect ? C.greenL : isWrong ? C.redL : (selected ? C.purpleL : hex2rgba(C.text, 0.7 + hv * 0.3));
      ctx.fillText(`${labels[i]}:  ${q.answers[i]}`, ax + 14, aby + ah / 2);
    }

    // Status
    const sy = ay + 2 * (ah + 10) + 8;
    ctx.textAlign = 'center';
    if (this.phase === 'question') {
      if (!this.myAlive) { ctx.font = `700 ${m ? 13 : 15}px Inter,system-ui,sans-serif`; ctx.fillStyle = C.red; ctx.fillText('💀 Si vyradený – sleduješ', cx, sy); }
      else if (this.myAnswer !== null) { ctx.font = `700 ${m ? 13 : 15}px Inter,system-ui,sans-serif`; ctx.fillStyle = C.purpleL; ctx.fillText('⏳ Čakám na ostatných...', cx, sy); }
      else { ctx.font = `700 ${m ? 13 : 15}px Inter,system-ui,sans-serif`; ctx.fillStyle = C.gold; ctx.fillText('🎯 Vyber odpoveď!', cx, sy); }
    } else {
      const correctAns = q.answers[q.correct];
      ctx.font = `700 ${m ? 13 : 15}px Inter,system-ui,sans-serif`; ctx.fillStyle = C.greenL;
      ctx.fillText(`✅ Správne: ${correctAns}`, cx, sy);
    }

    // Leave button
    const lbw = m ? 80 : 100, lbh = 30, leave = { x: cx - lbw / 2, y: sy + 24, w: lbw, h: lbh };
    this.hits.leave = leave;
    rr(ctx, leave.x, leave.y, lbw, lbh, 10); ctx.fillStyle = anim.leaveH ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.03)'; ctx.fill();
    rr(ctx, leave.x, leave.y, lbw, lbh, 10); ctx.strokeStyle = anim.leaveH ? C.red : 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.font = `600 ${m ? 10 : 11}px Inter,system-ui,sans-serif`; ctx.fillStyle = anim.leaveH ? C.redL : C.dim;
    ctx.textAlign = 'center'; ctx.fillText('🚪 Odísť', leave.x + lbw / 2, leave.y + lbh / 2);
  }

  _drawResult() {
    const { ctx, W, H, anim } = this; const m = W < 600;
    ctx.save(); ctx.globalAlpha = anim.resultA;
    ctx.fillStyle = 'rgba(0,0,0,0.87)'; ctx.fillRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2;
    const pw = Math.min(420, W - 24), ph = m ? 340 : 380, px = cx - pw / 2, py = cy - ph / 2;
    rr(ctx, px, py, pw, ph, 24);
    const bg = ctx.createLinearGradient(px, py, px, py + ph);
    bg.addColorStop(0, '#0a0a2e'); bg.addColorStop(1, '#050520');
    ctx.fillStyle = bg; ctx.fill();
    rr(ctx, px, py, pw, ph, 24); ctx.strokeStyle = C.purple; ctx.lineWidth = 2; ctx.stroke();

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '900 32px Inter,system-ui,sans-serif';
    ctx.shadowColor = C.purple; ctx.shadowBlur = 20; ctx.fillStyle = C.purpleL;
    ctx.fillText('💎 KONIEC HRY', cx, py + 50); ctx.shadowBlur = 0;

    // Ranking
    const ranked = [...this.players].sort((a, b) => b.score - a.score);
    const startY = py + 90, rowH = m ? 36 : 42;
    ranked.forEach((p, i) => {
      const ry = startY + i * rowH;
      const me = p.isMe;
      rr(ctx, px + 16, ry, pw - 32, rowH - 4, 10);
      ctx.fillStyle = me ? hex2rgba(C.purple, 0.15) : hex2rgba('#fff', 0.02); ctx.fill();
      if (me) { rr(ctx, px + 16, ry, pw - 32, rowH - 4, 10); ctx.strokeStyle = C.purpleL; ctx.lineWidth = 1; ctx.stroke(); }
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      ctx.textAlign = 'left'; ctx.font = `700 ${m ? 14 : 16}px Inter,system-ui,sans-serif`; ctx.fillStyle = C.text;
      ctx.fillText(`${medal}  ${p.name}`, px + 28, ry + rowH / 2 - 2);
      ctx.textAlign = 'right'; ctx.fillStyle = p.alive ? C.greenL : C.dim;
      ctx.fillText(`${p.score} bodov`, px + pw - 28, ry + rowH / 2 - 2);
    });

    // Exit button
    const bbw = 155, bbh = 42;
    const eb = { x: cx - bbw / 2, y: py + ph - 60, w: bbw, h: bbh }; this.hits.exit = eb;
    rr(ctx, eb.x, eb.y, bbw, bbh, 14); ctx.fillStyle = hex2rgba(C.gold, 0.1 + anim.exitH * 0.1); ctx.fill();
    rr(ctx, eb.x, eb.y, bbw, bbh, 14); ctx.strokeStyle = C.gold; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.font = '700 13px Inter,system-ui,sans-serif'; ctx.fillStyle = C.goldL;
    ctx.textAlign = 'center'; ctx.fillText('🔙 Menu', eb.x + bbw / 2, eb.y + bbh / 2);
    ctx.restore();
  }

  destroy() {
    this._dead = true; clearInterval(this._timerInterval);
    if (this._gameCh) this._gameCh.unsubscribe();
    window.removeEventListener('resize', this._resize);
    this.canvas.removeEventListener('mousemove', this._onMove);
    this.canvas.removeEventListener('mousedown', this._onClick);
    gsap.killTweensOf(this.anim);
  }
}
