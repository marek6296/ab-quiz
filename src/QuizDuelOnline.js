import gsap from 'gsap';
import { supabase } from './lib/supabase';

const C={bg:'#020d05',green:'#22c55e',greenL:'#4ade80',greenD:'#15803d',
  blue:'#3b82f6',blueL:'#60a5fa',orange:'#f59e0b',orangeL:'#fbbf24',
  red:'#ef4444',redL:'#f87171',gold:'#f59e0b',goldL:'#fbbf24',
  text:'#fff',muted:'#6b7280',dim:'#374151',hexN:'#0f2f1a',hexB:'rgba(34,197,94,0.25)'};
const hex2rgba=(h,a)=>{const[r,g,b]=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));return`rgba(${r},${g},${b},${a})`};
function rr(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.lineTo(x+w-r,y);c.arcTo(x+w,y,x+w,y+r,r);c.lineTo(x+w,y+h-r);c.arcTo(x+w,y+h,x+w-r,y+h,r);c.lineTo(x+r,y+h);c.arcTo(x,y+h,x,y+h-r,r);c.lineTo(x,y+r);c.arcTo(x,y,x+r,y,r);c.closePath()}
function shuffle(a){const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]]}return b}
function drawHex(ctx,cx,cy,s,fill,stroke,lw=1.5,glow=null){
  ctx.beginPath();for(let i=0;i<6;i++){const a=Math.PI/6+(Math.PI/3)*i;const x=cx+s*Math.cos(a),y=cy+s*Math.sin(a);i===0?ctx.moveTo(x,y):ctx.lineTo(x,y)}ctx.closePath();
  if(glow){ctx.shadowColor=glow;ctx.shadowBlur=18}ctx.fillStyle=fill;ctx.fill();ctx.shadowBlur=0;
  if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lw;ctx.stroke()}}
function hexHit(cx,cy,s,px,py){const dx=Math.abs(px-cx),dy=Math.abs(py-cy);if(dx>s||dy>s)return false;return dx*0.5+dy*0.866<=s*0.866}

const ROWS=[1,2,3,4,5,6,7],TOTAL=28,ROUND_TIME=15;
function buildGrid(cx,sy,hw,hh){const cells=[];let id=0;const vg=hh*0.75;
  for(let r=0;r<ROWS.length;r++){const n=ROWS[r];const rw=n*hw;const sx=cx-rw/2+hw/2;
    for(let c=0;c<n;c++)cells.push({id:id++,row:r,col:c,x:sx+c*hw,y:sy+r*vg,owner:null,num:id});}return cells}

const FQ=[
  {q:'Aké je hlavné mesto Slovenska?',a:'bratislava',d:1},{q:'Koľko planét má Slnečná sústava?',a:'8',d:1},
  {q:'Kto napísal Romea a Júliu?',a:'shakespeare',d:1},{q:'Aký je chemický vzorec vody?',a:'h2o',d:1},
  {q:'Koľko strán má trojuholník?',a:'3',d:1},{q:'Kto namaľoval Monu Lízu?',a:'da vinci',d:1},
  {q:'Koľko minút má hodina?',a:'60',d:1},{q:'Ktoré zviera je najrýchlejšie?',a:'gepard',d:1},
];
async function loadQ(){try{const{data,error}=await supabase.from('quiz_questions').select('*').eq('reported',false);
  if(!error&&data&&data.length>=10)return data.map(r=>({id:r.id,q:r.question,a:r.answer_a.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''),d:r.difficulty}));
}catch(e){}return FQ}
function normalize(s){return s.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'')}
function checkAnswer(input,correct){const a=normalize(input),b=normalize(correct);if(a===b)return true;
  if(a.length<2||b.length<2)return a===b;let d=0;const mx=Math.max(a.length,b.length);
  for(let i=0;i<mx;i++)if(a[i]!==b[i])d++;return d<=Math.floor(b.length*0.25)}

/**
 * QuizDuelOnline – 1v1 real-time quiz duel on hexagon board.
 * Both players take turns picking hexagons and answering questions.
 * Turn order and answers synced via game_sessions.state and game_players.
 */
export class QuizDuelOnline {
  constructor({ canvas, user, profile, game, isHost, onEnd }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = window.devicePixelRatio || 1;
    this.user = user; this.profile = profile;
    this.game = game; this.isHost = isHost; this.onEnd = onEnd;
    this.W = 0; this.H = 0; this._dead = false; this._time = 0;

    this.phase = 'waiting'; // waiting|countdown|selectHex|question|reveal|steal|result
    this.cells = []; this.questions = []; this.qIdx = 0;
    this.turn = null; // 'me'|'opp'
    this.currentHex = null; this.timer = ROUND_TIME;
    this._ti = null; this.countdownNum = 3;
    this.typedAnswer = ''; this.answerResult = null;
    this.stealPhase = false; this.stealFor = null;
    this.pScore = 0; this.oScore = 0; this.hexSize = 36;
    this.hoverHex = null;

    this.myName = profile?.username || user?.email?.split('@')[0] || 'Ty';
    this.oppName = '...'; this.myPlayerId = null; this.oppPlayerId = null;

    this.anim = { boardA:0,qA:0,qY:20,revealA:0,resultA:0,countdownScale:0,
      leaveH:0,selectGlow:0,stealYesH:0,stealNoH:0,exitH:0,playH:0 };
    this.hits = {};

    this._resize = this._resize.bind(this);
    this._onMove = this._onMove.bind(this);
    this._onClick = this._onClick.bind(this);
    this._onKey = this._onKey.bind(this);
    window.addEventListener('resize', this._resize);
    canvas.addEventListener('mousemove', this._onMove);
    canvas.addEventListener('mousedown', this._onClick);
    canvas.addEventListener('touchstart', e => this._onClick(e), { passive: true });
    window.addEventListener('keydown', this._onKey);

    // Hidden input for mobile keyboard
    this._hiddenInput = document.createElement('input');
    Object.assign(this._hiddenInput.style, { position:'fixed',bottom:'0',left:'0',width:'1px',height:'1px',
      opacity:'0.01',fontSize:'16px',zIndex:'-1',pointerEvents:'none',border:'none',padding:'0' });
    this._hiddenInput.setAttribute('autocomplete','off');
    this._hiddenInput.addEventListener('input', () => { this.typedAnswer = this._hiddenInput.value.slice(0,40); });
    this._hiddenInput.addEventListener('keydown', (e) => { if(e.key==='Enter'){e.preventDefault();this._submitTyped()} });
    document.body.appendChild(this._hiddenInput);

    this._resize();
    this._init();
  }

  async _init() {
    const m = this.W < 600, hw = m ? 46 : 70, hh = m ? 53 : 80, sy = m ? 70 : 90;
    this.cells = buildGrid(this.W / 2, sy, hw, hh);
    this.hexSize = m ? 24 : 36;

    if (this.isHost) {
      const allQ = await loadQ();
      this.questions = shuffle(allQ).slice(0, TOTAL);
      
      // Store questions and board state
      await supabase.from('game_sessions').update({
        state: {
          questions: this.questions,
          cells: this.cells.map(c => ({ id: c.id, owner: null })),
          turn: 'host', qIdx: 0,
        },
        status: 'waiting',
      }).eq('id', this.game.id);

      const { data: myP } = await supabase.from('game_players').insert({
        session_id: this.game.id, user_id: this.user.id,
        player_name: this.myName, score: 0,
      }).select().single();
      this.myPlayerId = myP?.id;
      this.turn = 'me';
    } else {
      const { data: g } = await supabase.from('game_sessions')
        .select('*').eq('id', this.game.id).single();
      if (g?.state) {
        this.questions = g.state.questions || [];
        this.qIdx = g.state.qIdx || 0;
        if (g.state.cells) {
          g.state.cells.forEach(sc => {
            const cell = this.cells.find(c => c.id === sc.id);
            if (cell) cell.owner = sc.owner;
          });
        }
      }
      
      const { data: myP } = await supabase.from('game_players').insert({
        session_id: this.game.id, user_id: this.user.id,
        player_name: this.myName, score: 0,
      }).select().single();
      this.myPlayerId = myP?.id;
      this.turn = 'opp'; // host goes first

      await supabase.from('game_sessions').update({ status: 'playing' }).eq('id', this.game.id);
    }

    this._subscribeRealtime();
    this._loop();
    await this._checkPlayers();
  }

  async _checkPlayers() {
    const { data: players } = await supabase.from('game_players')
      .select('*').eq('session_id', this.game.id);
    if (players && players.length >= 2) {
      const opp = players.find(p => p.user_id !== this.user.id);
      if (opp) { this.oppName = opp.player_name || 'Súper'; this.oppPlayerId = opp.id; }
      if (this.phase === 'waiting') this._startCountdown();
    }
  }

  _subscribeRealtime() {
    this._gameCh = supabase.channel(`quiz-duel-${this.game.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'game_sessions',
        filter: `id=eq.${this.game.id}`,
      }, (payload) => {
        const g = payload.new;
        if (g.status === 'playing' && this.phase === 'waiting') this._checkPlayers();
        if (g.status === 'abandoned') this._oppLeft();
        // Sync game state updates (hex selections, turn changes)
        if (g.state && this.phase !== 'waiting') {
          this._syncState(g.state);
        }
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'game_players',
        filter: `session_id=eq.${this.game.id}`,
      }, (payload) => {
        const p = payload.new;
        if (!p || p.user_id === this.user.id) return;
        if (payload.eventType === 'INSERT') {
          this.oppName = p.player_name || 'Súper';
          this.oppPlayerId = p.id;
          if (this.phase === 'waiting') this._checkPlayers();
        }
        if (payload.eventType === 'UPDATE') {
          this.oScore = p.score || 0;
          // Opponent answered
          if (p.last_answer && this.phase === 'question' && this.turn === 'opp') {
            this.answerResult = p.last_answer.correct ? 'correct' : 'wrong';
            this._doReveal();
          }
          // Opponent stole/declined
          if (p.last_answer?.steal !== undefined && this.phase === 'steal' && this.stealFor === 'opp') {
            if (p.last_answer.steal) {
              this.currentHex.owner = 'opp'; this.oScore = p.score || 0;
            } else {
              this.currentHex.owner = 'black';
            }
            this._afterSteal();
          }
        }
      })
      .subscribe();
  }

  _syncState(state) {
    if (state.cells) {
      state.cells.forEach(sc => {
        const cell = this.cells.find(c => c.id === sc.id);
        if (cell) {
          // Map host/joiner to me/opp
          if (sc.owner === 'host') cell.owner = this.isHost ? 'me' : 'opp';
          else if (sc.owner === 'joiner') cell.owner = this.isHost ? 'opp' : 'me';
          else cell.owner = sc.owner;
        }
      });
    }
    if (state.selectedHex !== undefined && this.turn === 'opp' && this.phase === 'selectHex') {
      this.currentHex = this.cells.find(c => c.id === state.selectedHex);
      if (this.currentHex) this._startQuestion();
    }
  }

  _startCountdown() {
    this.phase = 'countdown'; this.countdownNum = 3; this.anim.boardA = 0;
    gsap.to(this.anim, { boardA: 1, duration: 0.8, delay: 0.2 });
    const t = () => { if(this._dead)return; this.anim.countdownScale = 0;
      gsap.fromTo(this.anim,{countdownScale:2},{countdownScale:1,duration:0.5,ease:'back.out(2)'});
      if(this.countdownNum<=0){this._startSelect();return}setTimeout(()=>{this.countdownNum--;t()},1000)};t();
  }

  _startSelect() {
    this.phase = 'selectHex'; this.currentHex = null; this.typedAnswer = '';
    this.answerResult = null; this.stealPhase = false;
    this.anim.qA = 0; this.anim.revealA = 0;
    const free = this.cells.filter(c => c.owner === null || c.owner === 'black');
    if (free.length === 0 || this.qIdx >= this.questions.length) { this._showResult(); return; }
    this.anim.selectGlow = 0;
    gsap.to(this.anim, { selectGlow: 1, duration: 0.5, repeat: -1, yoyo: true, ease: 'sine.inOut' });
  }

  async _selectHex(id) {
    const c = this.cells.find(x => x.id === id);
    if (!c || c.owner === 'me' || c.owner === 'opp') return;
    this.currentHex = c;
    gsap.killTweensOf(this.anim, 'selectGlow'); this.anim.selectGlow = 0;
    
    // Notify opponent about selection
    const myRole = this.isHost ? 'host' : 'joiner';
    await supabase.from('game_sessions').update({
      state: {
        ...this.game.state,
        selectedHex: id,
        turn: myRole,
      },
    }).eq('id', this.game.id);
    
    this._startQuestion();
  }

  _startQuestion() {
    if (this.qIdx >= this.questions.length) { this._showResult(); return; }
    this.phase = 'question'; this.typedAnswer = ''; this.answerResult = null;
    this.timer = ROUND_TIME;
    this.anim.qA = 0; this.anim.qY = 20; this.anim.revealA = 0;
    gsap.to(this.anim, { qA: 1, qY: 0, duration: 0.5, ease: 'back.out(1.2)' });

    if (this.turn === 'me' && this._hiddenInput) {
      this._hiddenInput.value = '';
      this._hiddenInput.style.pointerEvents = 'auto';
      setTimeout(() => { if (!this._dead && this.phase === 'question') this._hiddenInput.focus(); }, 100);
    }

    clearInterval(this._ti);
    this._ti = setInterval(() => {
      if (this._dead || this.phase !== 'question') return;
      this.timer -= 0.1;
      if (this.timer <= 0) {
        this.timer = 0; clearInterval(this._ti);
        if (this.turn === 'me' && !this.answerResult) {
          this.answerResult = 'timeout'; this._doReveal();
        }
      }
    }, 100);
  }

  async _submitTyped() {
    if (this.phase !== 'question' || this.turn !== 'me' || this.answerResult) return;
    const q = this.questions[this.qIdx];
    const ok = checkAnswer(this.typedAnswer, q.a);
    this.answerResult = ok ? 'correct' : 'wrong';
    if (this._hiddenInput) { this._hiddenInput.blur(); this._hiddenInput.style.pointerEvents = 'none'; }

    if (ok) this.pScore++;
    await supabase.from('game_players').update({
      last_answer: { correct: ok, answer: this.typedAnswer },
      score: this.pScore,
    }).eq('id', this.myPlayerId);

    this._doReveal();
  }

  _doReveal() {
    if (this.phase !== 'question') return;
    clearInterval(this._ti);
    this.phase = 'reveal';
    const correct = this.answerResult === 'correct';
    gsap.to(this.anim, { revealA: 1, duration: 0.5 });

    if (correct) {
      const owner = this.turn === 'me' ? 'me' : 'opp';
      this.currentHex.owner = owner;
      this.qIdx++;
      this._updateCellsInDB();
      setTimeout(() => { if (!this._dead) this._nextTurn(); }, 1800);
    } else {
      this.qIdx++;
      setTimeout(() => { if (!this._dead) this._startSteal(); }, 1500);
    }
  }

  _startSteal() {
    this.stealPhase = true;
    this.stealFor = this.turn === 'me' ? 'opp' : 'me';
    this.phase = 'steal'; this.anim.qA = 1;
    // If it's my turn to steal, show buttons. If opp, wait for their response.
  }

  async _playerStealYes() {
    if (this.phase !== 'steal' || this.stealFor !== 'me') return;
    this.currentHex.owner = 'me'; this.pScore++;
    await supabase.from('game_players').update({
      last_answer: { steal: true }, score: this.pScore,
    }).eq('id', this.myPlayerId);
    this._updateCellsInDB();
    this._afterSteal();
  }

  async _playerStealNo() {
    if (this.phase !== 'steal' || this.stealFor !== 'me') return;
    this.currentHex.owner = 'black';
    await supabase.from('game_players').update({
      last_answer: { steal: false },
    }).eq('id', this.myPlayerId);
    this._updateCellsInDB();
    this._afterSteal();
  }

  _afterSteal() {
    this.stealPhase = false;
    gsap.to(this.anim, { qA: 0, qY: -30, duration: 0.3, onComplete: () => {
      if (!this._dead) this._nextTurn();
    }});
  }

  _nextTurn() {
    const free = this.cells.filter(c => c.owner === null || c.owner === 'black');
    if (free.length === 0 || this.qIdx >= this.questions.length) { this._showResult(); return; }
    this.turn = this.turn === 'me' ? 'opp' : 'me';
    // Reset opponent's last_answer
    supabase.from('game_players').update({ last_answer: null }).eq('id', this.myPlayerId).then();
    this._startSelect();
  }

  async _updateCellsInDB() {
    const cellState = this.cells.map(c => ({
      id: c.id,
      owner: c.owner === 'me' ? (this.isHost ? 'host' : 'joiner') :
             c.owner === 'opp' ? (this.isHost ? 'joiner' : 'host') : c.owner,
    }));
    await supabase.from('game_sessions').update({
      state: { ...this.game.state, cells: cellState, qIdx: this.qIdx },
    }).eq('id', this.game.id);
  }

  _showResult() {
    this.phase = 'result'; this.anim.resultA = 0;
    gsap.to(this.anim, { resultA: 1, duration: 0.6 });
    supabase.from('game_sessions').update({ status: 'finished' }).eq('id', this.game.id).then();
  }

  _leaveGame() {
    supabase.from('game_sessions').update({ status: 'abandoned' }).eq('id', this.game.id).then();
    this.destroy(); this.onEnd();
  }

  _oppLeft() {
    this.phase = 'result'; this.oppName += ' (odišiel)';
    this.anim.resultA = 0; gsap.to(this.anim, { resultA: 1, duration: 0.6 });
  }

  _onKey(e) {
    if (this.phase === 'question' && this.turn === 'me' && !this.answerResult) {
      if (e.key === 'Enter') { e.preventDefault(); this._submitTyped(); return; }
      if (e.key === 'Backspace') { this.typedAnswer = this.typedAnswer.slice(0, -1);
        if (this._hiddenInput) this._hiddenInput.value = this.typedAnswer; return; }
      if (e.key.length === 1 && this.typedAnswer.length < 40) {
        this.typedAnswer += e.key;
        if (this._hiddenInput) this._hiddenInput.value = this.typedAnswer;
      }
    }
  }

  _resize() {
    const r = this.canvas.getBoundingClientRect();
    this.W = r.width || window.innerWidth; this.H = r.height || window.innerHeight;
    this.canvas.width = this.W * this.dpr; this.canvas.height = this.H * this.dpr;
    if (this.cells.length > 0) {
      const m = this.W < 600, hw = m ? 46 : 70, hh = m ? 53 : 80, sy = m ? 70 : 90;
      this.hexSize = m ? 24 : 36;
      const ow = this.cells.map(c => c.owner);
      this.cells = buildGrid(this.W / 2, sy, hw, hh);
      ow.forEach((o, i) => { if (this.cells[i]) this.cells[i].owner = o; });
    }
  }
  _pos(e) { const r = this.canvas.getBoundingClientRect(); if (e.touches) return { x: e.touches[0].clientX - r.left, y: e.touches[0].clientY - r.top }; return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  _hit(p, a) { return a && p.x >= a.x && p.x <= a.x + a.w && p.y >= a.y && p.y <= a.y + a.h; }

  _onMove(e) {
    const p = this._pos(e); this.hoverHex = null;
    if (this.phase === 'selectHex' && this.turn === 'me')
      for (const c of this.cells)
        if ((c.owner === null || c.owner === 'black') && hexHit(c.x, c.y, this.hexSize, p.x, p.y)) { this.hoverHex = c.id; break; }
    ['leaveH','exitH','playH','stealYesH','stealNoH'].forEach(k =>
      gsap.to(this.anim, { [k]: this._hit(p, this.hits[k.replace('H', '')]) ? 1 : 0, duration: 0.15 }));
    const any = this.hoverHex !== null || Object.values(this.hits).some(a => a && this._hit(p, a));
    this.canvas.style.cursor = any ? 'pointer' : 'default';
  }

  _onClick(e) {
    const p = this._pos(e);
    if (this.phase === 'selectHex' && this.turn === 'me')
      for (const c of this.cells) if ((c.owner === null || c.owner === 'black') && hexHit(c.x, c.y, this.hexSize, p.x, p.y)) { this._selectHex(c.id); break; }
    if (this.phase === 'question' && this.turn === 'me') { if (this._hit(p, this.hits.submit)) this._submitTyped(); }
    if (this.phase === 'steal' && this.stealFor === 'me') {
      if (this._hit(p, this.hits.stealYes)) this._playerStealYes();
      if (this._hit(p, this.hits.stealNo)) this._playerStealNo();
    }
    if (['question','reveal','selectHex','steal'].includes(this.phase)) {
      if (this._hit(p, this.hits.leave)) this._leaveGame();
    }
    if (this.phase === 'result') {
      if (this._hit(p, this.hits.exit)) { this.destroy(); this.onEnd(); }
    }
  }

  _loop() {
    if (this._dead) return; requestAnimationFrame(() => this._loop()); this._time += 0.016;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); this._draw();
  }

  _draw() {
    const { ctx, W, H } = this;
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#010d04'); bg.addColorStop(0.5, '#031a08'); bg.addColorStop(1, '#010d04');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    if (this.phase === 'waiting') this._drawWaiting();
    else if (this.phase === 'countdown') { this._drawSB(); this._drawBoard(); this._drawCD(); }
    else if (this.phase === 'selectHex') { this._drawSB(); this._drawBoard(); this._drawSelUI(); }
    else if (this.phase === 'question' || this.phase === 'reveal') { this._drawSB(); this._drawBoard(); this._drawQ(); }
    else if (this.phase === 'steal') { this._drawSB(); this._drawBoard(); this._drawSteal(); }
    else if (this.phase === 'result') { this._drawBoard(); this._drawResult(); }
  }

  _drawWaiting() {
    const { ctx, W, H } = this; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '700 24px Inter,system-ui,sans-serif'; ctx.fillStyle = C.greenL;
    ctx.fillText('Čakám na súpera...', W / 2, H / 2 - 20);
    ctx.font = '400 14px Inter,system-ui,sans-serif'; ctx.fillStyle = C.muted;
    ctx.fillText(`Kód: ${this.game.join_code || ''}`, W / 2, H / 2 + 20);
  }

  _drawSB() {
    const { ctx, W } = this; const m = W < 600, y = m ? 18 : 24;
    ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    ctx.font = `700 ${m ? 12 : 14}px Inter,system-ui,sans-serif`;
    ctx.fillStyle = C.blueL; ctx.fillText(`👤 ${this.myName}`, W / 2 - (m ? 60 : 80), y);
    ctx.font = `900 ${m ? 18 : 22}px Inter,system-ui,sans-serif`;
    ctx.fillStyle = '#fff'; ctx.fillText(`${this.pScore}`, W / 2 - (m ? 30 : 40), y);
    ctx.font = `700 ${m ? 10 : 13}px Inter,system-ui,sans-serif`;
    ctx.fillStyle = C.dim; ctx.fillText('vs', W / 2, y);
    ctx.fillStyle = '#fff'; ctx.font = `900 ${m ? 18 : 22}px Inter,system-ui,sans-serif`;
    ctx.fillText(`${this.oScore}`, W / 2 + (m ? 30 : 40), y);
    ctx.font = `700 ${m ? 12 : 14}px Inter,system-ui,sans-serif`;
    ctx.fillStyle = C.orangeL; ctx.fillText(`👤 ${this.oppName}`, W / 2 + (m ? 65 : 85), y);
  }

  _drawBoard() {
    const { ctx, anim } = this; ctx.save(); ctx.globalAlpha = anim.boardA;
    for (const c of this.cells) {
      let fill, stroke, glow = null, lw = 1.5;
      const hov = this.hoverHex === c.id;
      const sel = this.currentHex && this.currentHex.id === c.id;
      if (c.owner === 'me') { fill = hex2rgba(C.blue, 0.35); stroke = C.blue; glow = 'rgba(59,130,246,0.35)'; lw = 2; }
      else if (c.owner === 'opp') { fill = hex2rgba(C.orange, 0.35); stroke = C.orange; glow = 'rgba(245,158,11,0.35)'; lw = 2; }
      else if (c.owner === 'black') { fill = '#111'; stroke = '#333'; lw = 1; }
      else if (sel) { fill = hex2rgba(C.greenL, 0.3); stroke = C.greenL; glow = 'rgba(74,222,128,0.4)'; lw = 2.5; }
      else if (hov) { fill = 'rgba(74,222,128,0.15)'; stroke = C.greenL; lw = 2; }
      else { fill = C.hexN; stroke = C.hexB; }
      drawHex(ctx, c.x, c.y, this.hexSize, fill, stroke, lw, glow);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `700 ${this.hexSize > 30 ? 13 : 9}px Inter,system-ui,sans-serif`;
      if (c.owner === 'me') { ctx.fillStyle = C.blueL; ctx.fillText('👤', c.x, c.y); }
      else if (c.owner === 'opp') { ctx.fillStyle = C.orangeL; ctx.fillText('👤', c.x, c.y); }
      else if (c.owner === 'black') { ctx.fillStyle = '#444'; ctx.fillText('✕', c.x, c.y); }
      else { ctx.fillStyle = hex2rgba(C.greenL, 0.5); ctx.fillText(`${c.num}`, c.x, c.y); }
    }
    ctx.restore();
  }

  _drawCD() {
    const { ctx, W, H, anim } = this; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(anim.countdownScale, anim.countdownScale);
    ctx.font = '900 100px Inter,system-ui,sans-serif'; ctx.fillStyle = C.greenL;
    ctx.shadowColor = C.green; ctx.shadowBlur = 30;
    ctx.fillText(this.countdownNum > 0 ? `${this.countdownNum}` : 'GO!', 0, 0); ctx.restore();
  }

  _drawSelUI() {
    const { ctx, W, H, anim } = this; const m = W < 600, cx = W / 2;
    const bb = this.cells[this.cells.length - 1]?.y + this.hexSize + 20 || H * 0.6;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const ga = 0.5 + anim.selectGlow * 0.5;
    if (this.turn === 'me') { ctx.font = `700 ${m ? 14 : 18}px Inter,system-ui,sans-serif`; ctx.fillStyle = `rgba(59,130,246,${ga})`; ctx.fillText('🎯 Vyber si hexagon!', cx, bb); }
    else { ctx.font = `700 ${m ? 14 : 18}px Inter,system-ui,sans-serif`; ctx.fillStyle = `rgba(245,158,11,${ga})`; ctx.fillText(`🎯 ${this.oppName} vyberá...`, cx, bb); }
    const lbw = m ? 80 : 100, lbh = 30, leave = { x: cx - lbw / 2, y: bb + 25, w: lbw, h: lbh };
    this.hits.leave = leave;
    rr(ctx, leave.x, leave.y, lbw, lbh, 10); ctx.fillStyle = anim.leaveH ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.03)'; ctx.fill();
    rr(ctx, leave.x, leave.y, lbw, lbh, 10); ctx.strokeStyle = anim.leaveH ? C.red : 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.font = `600 ${m ? 10 : 11}px Inter,system-ui,sans-serif`; ctx.fillStyle = anim.leaveH ? C.redL : C.dim; ctx.fillText('🚪 Odísť', leave.x + lbw / 2, leave.y + lbh / 2);
  }

  _drawQ() {
    const { ctx, W, H, anim } = this; const m = W < 600, cx = W / 2;
    const q = this.questions[this.phase === 'reveal' ? Math.max(0, this.qIdx - 1) : this.qIdx]; if (!q) return;
    const bb = this.cells[this.cells.length - 1]?.y + this.hexSize + 10 || H * 0.55;
    ctx.save(); ctx.globalAlpha = anim.qA; ctx.translate(0, anim.qY);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const tc = this.turn === 'me' ? C.blueL : C.orangeL;
    ctx.font = `600 ${m ? 10 : 12}px Inter,system-ui,sans-serif`; ctx.fillStyle = tc;
    ctx.fillText(this.turn === 'me' ? '🟦 Tvoj ťah – napíš odpoveď' : `🟧 ${this.oppName} odpovedá...`, cx, bb - 2);
    const tw = m ? Math.min(W - 40, 180) : 200, th = 4, ty = bb + 10;
    const pct = Math.max(0, this.timer / ROUND_TIME);
    rr(ctx, cx - tw / 2, ty, tw, th, 3); ctx.fillStyle = '#1a1a1a'; ctx.fill();
    if (pct > 0) { rr(ctx, cx - tw / 2, ty, tw * pct, th, 3); ctx.fillStyle = pct > 0.3 ? C.green : C.red; ctx.fill(); }
    const qcw = Math.min(W - 24, 460), qch = m ? 55 : 65, qcy = ty + 28;
    rr(ctx, cx - qcw / 2, qcy, qcw, qch, 14); ctx.fillStyle = hex2rgba(C.green, 0.06); ctx.fill();
    rr(ctx, cx - qcw / 2, qcy, qcw, qch, 14); ctx.strokeStyle = hex2rgba(C.green, 0.2); ctx.lineWidth = 1; ctx.stroke();
    ctx.font = `700 ${m ? 13 : 16}px Inter,system-ui,sans-serif`; ctx.fillStyle = C.text;
    const words = q.q.split(' '); let line = '', lines = [];
    for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > qcw - 30 && line) { lines.push(line); line = w; } else line = t; }
    if (line) lines.push(line); const lh = m ? 18 : 22;
    lines.forEach((l, i) => ctx.fillText(l, cx, qcy + qch / 2 - (lines.length - 1) * lh / 2 + i * lh));

    const iw = Math.min(W - 24, 340), ih = 44, iy = qcy + qch + 12;
    if (this.phase === 'question' && this.turn === 'me') {
      rr(ctx, cx - iw / 2, iy, iw, ih, 12); ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill();
      rr(ctx, cx - iw / 2, iy, iw, ih, 12); ctx.strokeStyle = hex2rgba(C.blue, 0.4); ctx.lineWidth = 1.5; ctx.stroke();
      ctx.font = `500 ${m ? 14 : 16}px Inter,system-ui,sans-serif`; ctx.fillStyle = this.typedAnswer ? C.text : 'rgba(255,255,255,0.3)';
      ctx.fillText(this.typedAnswer || 'Napíš odpoveď...', cx, iy + ih / 2);
      const sbw = m ? 100 : 120, sbh = 38, sb = { x: cx - sbw / 2, y: iy + ih + 10, w: sbw, h: sbh };
      this.hits.submit = sb;
      rr(ctx, sb.x, sb.y, sbw, sbh, 12); ctx.fillStyle = this.typedAnswer ? hex2rgba(C.green, 0.2) : 'rgba(255,255,255,0.03)'; ctx.fill();
      rr(ctx, sb.x, sb.y, sbw, sbh, 12); ctx.strokeStyle = this.typedAnswer ? C.green : 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.font = '700 13px Inter,system-ui,sans-serif'; ctx.fillStyle = this.typedAnswer ? C.greenL : C.dim; ctx.fillText('Enter ⏎', sb.x + sbw / 2, sb.y + sbh / 2);
    }
    if (this.phase === 'reveal') {
      const ok = this.answerResult === 'correct';
      rr(ctx, cx - iw / 2, iy, iw, ih, 12); ctx.fillStyle = hex2rgba(ok ? C.green : C.red, 0.15); ctx.fill();
      rr(ctx, cx - iw / 2, iy, iw, ih, 12); ctx.strokeStyle = ok ? C.green : C.red; ctx.lineWidth = 2; ctx.stroke();
      ctx.font = `700 ${m ? 14 : 16}px Inter,system-ui,sans-serif`; ctx.fillStyle = ok ? C.greenL : C.redL;
      ctx.fillText(ok ? '✅ Správne!' : `❌ Správna: ${q.a}`, cx, iy + ih / 2);
    }
    // Leave
    const btnY = iy + ih + (this.phase === 'question' && this.turn === 'me' ? 58 : 16);
    const lbw = m ? 75 : 95, lbh = 28;
    const leave = { x: cx - lbw / 2, y: btnY, w: lbw, h: lbh }; this.hits.leave = leave;
    rr(ctx, leave.x, leave.y, lbw, lbh, 10); ctx.fillStyle = anim.leaveH ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.03)'; ctx.fill();
    rr(ctx, leave.x, leave.y, lbw, lbh, 10); ctx.strokeStyle = anim.leaveH ? C.red : 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.font = `600 ${m ? 9 : 10}px Inter,system-ui,sans-serif`; ctx.fillStyle = anim.leaveH ? C.redL : C.dim; ctx.fillText('🚪 Odísť', leave.x + lbw / 2, leave.y + lbh / 2);
    ctx.restore();
  }

  _drawSteal() {
    const { ctx, W, H, anim } = this; const m = W < 600, cx = W / 2;
    const bb = this.cells[this.cells.length - 1]?.y + this.hexSize + 20 || H * 0.6;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (this.stealFor === 'opp') {
      ctx.font = `700 ${m ? 14 : 16}px Inter,system-ui,sans-serif`; ctx.fillStyle = C.orangeL;
      ctx.fillText(`${this.oppName} rozhoduje o prevzatí...`, cx, bb);
    } else {
      ctx.font = `700 ${m ? 14 : 16}px Inter,system-ui,sans-serif`; ctx.fillStyle = C.blueL;
      ctx.fillText('❓ Chceš prevziať tento hexagon?', cx, bb);
      const bw = m ? 100 : 130, bh = 42, gap = 12;
      const yes = { x: cx - bw - gap / 2, y: bb + 20, w: bw, h: bh }; this.hits.stealYes = yes;
      rr(ctx, yes.x, yes.y, bw, bh, 14); ctx.fillStyle = hex2rgba(C.green, 0.15 + anim.stealYesH * 0.15); ctx.fill();
      rr(ctx, yes.x, yes.y, bw, bh, 14); ctx.strokeStyle = C.green; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.font = '700 14px Inter,system-ui,sans-serif'; ctx.fillStyle = C.greenL; ctx.fillText('✅ Áno', yes.x + bw / 2, yes.y + bh / 2);
      const no = { x: cx + gap / 2, y: bb + 20, w: bw, h: bh }; this.hits.stealNo = no;
      rr(ctx, no.x, no.y, bw, bh, 14); ctx.fillStyle = hex2rgba(C.red, 0.1 + anim.stealNoH * 0.1); ctx.fill();
      rr(ctx, no.x, no.y, bw, bh, 14); ctx.strokeStyle = C.red; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = C.redL; ctx.fillText('❌ Nie', no.x + bw / 2, no.y + bh / 2);
    }
    const lbw = m ? 80 : 100, lbh = 30, leave = { x: cx - lbw / 2, y: bb + 80, w: lbw, h: lbh }; this.hits.leave = leave;
    rr(ctx, leave.x, leave.y, lbw, lbh, 10); ctx.fillStyle = anim.leaveH ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.03)'; ctx.fill();
    rr(ctx, leave.x, leave.y, lbw, lbh, 10); ctx.strokeStyle = anim.leaveH ? C.red : 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.font = `600 ${m ? 10 : 11}px Inter,system-ui,sans-serif`; ctx.fillStyle = anim.leaveH ? C.redL : C.dim; ctx.fillText('🚪 Odísť', leave.x + lbw / 2, leave.y + lbh / 2);
  }

  _drawResult() {
    const { ctx, W, H, anim } = this; const m = W < 600;
    ctx.save(); ctx.globalAlpha = anim.resultA;
    ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2;
    const pw = Math.min(400, W - 24), ph = m ? 300 : 320, px = cx - pw / 2, py = cy - ph / 2;
    rr(ctx, px, py, pw, ph, 24);
    const bg = ctx.createLinearGradient(px, py, px, py + ph);
    bg.addColorStop(0, '#071a0a'); bg.addColorStop(1, '#020d04');
    ctx.fillStyle = bg; ctx.fill();
    const won = this.pScore > this.oScore, tied = this.pScore === this.oScore;
    const bc = won ? C.green : tied ? C.gold : C.red;
    rr(ctx, px, py, pw, ph, 24); ctx.strokeStyle = bc; ctx.lineWidth = 2; ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `900 ${m ? 28 : 34}px Inter,system-ui,sans-serif`;
    ctx.shadowColor = bc; ctx.shadowBlur = 20; ctx.fillStyle = bc;
    ctx.fillText(won ? '🏆 VÝHRA!' : tied ? '🤝 REMÍZA' : '😞 PREHRA', cx, py + 55); ctx.shadowBlur = 0;
    ctx.font = `700 ${m ? 13 : 16}px Inter,system-ui,sans-serif`;
    ctx.fillStyle = C.blueL; ctx.fillText(`👤 ${this.myName}`, cx - 60, py + 95);
    ctx.fillStyle = C.orangeL; ctx.fillText(`👤 ${this.oppName}`, cx + 60, py + 95);
    ctx.font = `900 ${m ? 36 : 44}px Inter,system-ui,sans-serif`; ctx.fillStyle = '#fff';
    ctx.fillText(`${this.pScore}`, cx - 60, py + 135); ctx.fillText(`${this.oScore}`, cx + 60, py + 135);
    ctx.font = '700 20px Inter,system-ui,sans-serif'; ctx.fillStyle = C.dim; ctx.fillText(':', cx, py + 130);

    const bbw = 155, bbh = 42;
    const eb = { x: cx - bbw / 2, y: py + ph - 60, w: bbw, h: bbh }; this.hits.exit = eb;
    rr(ctx, eb.x, eb.y, bbw, bbh, 14); ctx.fillStyle = hex2rgba(C.gold, 0.1 + anim.exitH * 0.1); ctx.fill();
    rr(ctx, eb.x, eb.y, bbw, bbh, 14); ctx.strokeStyle = C.gold; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.font = '700 13px Inter,system-ui,sans-serif'; ctx.fillStyle = C.goldL;
    ctx.fillText('🔙 Menu', eb.x + bbw / 2, eb.y + bbh / 2);
    ctx.restore();
  }

  destroy() {
    this._dead = true; clearInterval(this._ti);
    if (this._gameCh) this._gameCh.unsubscribe();
    window.removeEventListener('resize', this._resize);
    window.removeEventListener('keydown', this._onKey);
    this.canvas.removeEventListener('mousemove', this._onMove);
    this.canvas.removeEventListener('mousedown', this._onClick);
    if (this._hiddenInput?.parentNode) this._hiddenInput.remove();
    gsap.killTweensOf(this.anim);
  }
}
