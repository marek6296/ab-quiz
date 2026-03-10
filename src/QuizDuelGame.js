import gsap from 'gsap';
import { supabase } from './lib/supabase';

const C={bg:'#020d05',green:'#22c55e',greenL:'#4ade80',greenD:'#15803d',greenDim:'#0d3320',
  blue:'#3b82f6',blueL:'#60a5fa',blueGlow:'rgba(59,130,246,0.35)',
  orange:'#f59e0b',orangeL:'#fbbf24',orangeGlow:'rgba(245,158,11,0.35)',
  red:'#ef4444',redL:'#f87171',gold:'#f59e0b',goldL:'#fbbf24',
  text:'#fff',muted:'#6b7280',dim:'#374151',black:'#1a1a1a',
  hexN:'#0f2f1a',hexB:'rgba(34,197,94,0.25)',hexHov:'rgba(74,222,128,0.15)'};
const hex2rgba=(h,a)=>{const[r,g,b]=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));return`rgba(${r},${g},${b},${a})`};
function rr(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.lineTo(x+w-r,y);c.arcTo(x+w,y,x+w,y+r,r);c.lineTo(x+w,y+h-r);c.arcTo(x+w,y+h,x+w-r,y+h,r);c.lineTo(x+r,y+h);c.arcTo(x,y+h,x,y+h-r,r);c.lineTo(x,y+r);c.arcTo(x,y,x+r,y,r);c.closePath()}
function shuffle(a){const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]]}return b}

const ROWS=[1,2,3,4,5,6,7],TOTAL=28,ROUND_TIME=15;
function buildGrid(cx,sy,hw,hh){const cells=[];let id=0;const vg=hh*0.75;
  for(let r=0;r<ROWS.length;r++){const n=ROWS[r];const rw=n*hw;const sx=cx-rw/2+hw/2;
    for(let c=0;c<n;c++)cells.push({id:id++,row:r,col:c,x:sx+c*hw,y:sy+r*vg,owner:null,num:id});
  }return cells}
function drawHex(ctx,cx,cy,s,fill,stroke,lw=1.5,glow=null){
  ctx.beginPath();for(let i=0;i<6;i++){const a=Math.PI/6+(Math.PI/3)*i;const x=cx+s*Math.cos(a),y=cy+s*Math.sin(a);i===0?ctx.moveTo(x,y):ctx.lineTo(x,y)}ctx.closePath();
  if(glow){ctx.shadowColor=glow;ctx.shadowBlur=18}ctx.fillStyle=fill;ctx.fill();ctx.shadowBlur=0;
  if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lw;ctx.stroke()}}
function hexHit(cx,cy,s,px,py){const dx=Math.abs(px-cx),dy=Math.abs(py-cy);if(dx>s||dy>s)return false;return dx*0.5+dy*0.866<=s*0.866}

const FQ=[
  {q:'Aké je hlavné mesto Slovenska?',a:'bratislava',d:1},{q:'Koľko planét má Slnečná sústava?',a:'8',d:1},
  {q:'Kto napísal Romea a Júliu?',a:'shakespeare',d:1},{q:'Aký je chemický vzorec vody?',a:'h2o',d:1},
  {q:'Koľko strán má trojuholník?',a:'3',d:1},{q:'Kto namaľoval Monu Lízu?',a:'da vinci',d:1},
  {q:'Koľko minút má hodina?',a:'60',d:1},{q:'Ktoré zviera je najrýchlejšie?',a:'gepard',d:1},
  {q:'Aké je hlavné mesto Francúzska?',a:'pariz',d:1},{q:'Aký je najvyšší vrch sveta?',a:'everest',d:1},
  {q:'Koľko nôh má pavúk?',a:'8',d:1},{q:'Koľko farieb má dúha?',a:'7',d:1},
  {q:'V ktorom roku padol Berlínsky múr?',a:'1989',d:2},{q:'Ktorá krajina má najviac obyvateľov?',a:'india',d:2},
  {q:'Koľko kostí má dospelý človek?',a:'206',d:2},{q:'Koľko dní má prestupný rok?',a:'366',d:2},
  {q:'Kto vynašiel žiarovku?',a:'edison',d:2},{q:'V ktorom roku pristál človek na Mesiaci?',a:'1969',d:2},
  {q:'Koľko hráčov má futbalový tím?',a:'11',d:2},{q:'Aký je symbol zlata?',a:'au',d:2},
  {q:'Koľko zubov má dospelý človek?',a:'32',d:2},{q:'Kto napísal Hamleta?',a:'shakespeare',d:2},
  {q:'Koľko chromozómov má človek?',a:'46',d:3},{q:'Koľko sŕdc má chobotnica?',a:'3',d:3},
  {q:'Koľko litrov krvi má dospelý človek?',a:'5',d:3},{q:'Kto zložil Deviatú symfóniu?',a:'beethoven',d:3},
  {q:'V ktorom roku vzniklo Československo?',a:'1918',d:3},{q:'Aká je rýchlosť svetla v km/s?',a:'300000',d:3},
  {q:'Koľko percent povrchu Zeme pokrýva voda?',a:'71',d:3},{q:'Aký je najväčší orgán človeka?',a:'koza',d:3},
];
async function loadQ(){try{const{data,error}=await supabase.from('quiz_questions').select('*').eq('reported',false);
  if(!error&&data&&data.length>=10)return data.map(r=>({id:r.id,q:r.question,a:r.answer_a.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''),d:r.difficulty}));
}catch(e){}return FQ}
function normalize(s){return s.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'')}
function checkAnswer(input,correct){const a=normalize(input),b=normalize(correct);if(a===b)return true;
  if(a.length<2||b.length<2)return a===b;let d=0;const mx=Math.max(a.length,b.length);
  for(let i=0;i<mx;i++)if(a[i]!==b[i])d++;return d<=Math.floor(b.length*0.25)}

class Bot{
  constructor(diff){const d={easy:{acc:0.4,spd:[5,10]},medium:{acc:0.65,spd:[3,7]},hard:{acc:0.85,spd:[1.5,4]}};
    this.c=d[diff]||d.medium}
  willAnswer(q){return Math.random()<this.c.acc}
  delay(){const[a,b]=this.c.spd;return a+Math.random()*(b-a)}
  willSteal(){return Math.random()<(this.c.acc+0.1)}
  pickHex(cells){const mine=cells.filter(c=>c.owner==='bot'),free=cells.filter(c=>c.owner===null||c.owner==='black');
    if(free.length===0)return null;if(mine.length===0){const f=free.filter(c=>c.row<=2);return f.length?f[Math.floor(Math.random()*f.length)]:free[Math.floor(Math.random()*free.length)]}
    const adj=free.filter(fc=>mine.some(mc=>{const dr=Math.abs(fc.row-mc.row),dc=Math.abs(fc.col-mc.col);return dr===0?dc===1:dr===1&&dc<=1}));
    return adj.length?adj[Math.floor(Math.random()*adj.length)]:free[Math.floor(Math.random()*free.length)]}
}

export class QuizDuelGame{
  constructor(canvas,user,{onBack}){
    this.canvas=canvas;this.ctx=canvas.getContext('2d');this.dpr=window.devicePixelRatio||1;
    this.W=0;this.H=0;this.user=user;this.onBack=onBack;this._dead=false;this._time=0;
    this.phase='menu';this.turn='player';this.cells=[];this.questions=[];this.qIdx=0;
    this.currentHex=null;this.timer=ROUND_TIME;this._ti=null;this._bt=null;
    this.botDiff=null;this.bot=null;this.countdownNum=3;this.hoverHex=null;
    this.reportedQ=new Set();this._trans=false;this.pScore=0;this.bScore=0;
    this.typedAnswer='';this.answerResult=null; // null|'correct'|'wrong'|'timeout'
    this.stealPhase=false;this.stealFor=null; // 'player'|'bot'
    this.hexSize=36;
    this.anim={menuA:0,menuY:30,boardA:0,qA:0,qY:20,revealA:0,resultA:0,countdownScale:0,
      diffH:[0,0,0],playH:0,backH:0,exitH:0,leaveH:0,reportH:0,errorFlash:0,
      stealYesH:0,stealNoH:0,selectGlow:0,inputFocus:0};
    this.hits={};
    this._resize=this._resize.bind(this);this._onMove=this._onMove.bind(this);
    this._onClick=this._onClick.bind(this);this._onKey=this._onKey.bind(this);
    window.addEventListener('resize',this._resize);canvas.addEventListener('mousemove',this._onMove);
    canvas.addEventListener('mousedown',this._onClick);canvas.addEventListener('touchstart',e=>this._onClick(e),{passive:true});
    window.addEventListener('keydown',this._onKey);this._resize();
    // Hidden input for mobile keyboard
    this._hiddenInput=document.createElement('input');
    Object.assign(this._hiddenInput.style,{position:'fixed',bottom:'0',left:'0',width:'1px',height:'1px',
      opacity:'0.01',fontSize:'16px',zIndex:'-1',pointerEvents:'none',border:'none',padding:'0'});
    this._hiddenInput.setAttribute('autocomplete','off');this._hiddenInput.setAttribute('autocorrect','off');
    this._hiddenInput.setAttribute('autocapitalize','off');this._hiddenInput.setAttribute('spellcheck','false');
    this._hiddenInput.addEventListener('input',()=>{this.typedAnswer=this._hiddenInput.value.slice(0,40)});
    this._hiddenInput.addEventListener('keydown',(e)=>{if(e.key==='Enter'){e.preventDefault();this._submitTyped()}});
    document.body.appendChild(this._hiddenInput);
  }
  start(){this._animateMenu();this._loop()}
  destroy(){this._dead=true;clearInterval(this._ti);clearTimeout(this._bt);
    window.removeEventListener('resize',this._resize);window.removeEventListener('keydown',this._onKey);
    this.canvas.removeEventListener('mousemove',this._onMove);this.canvas.removeEventListener('mousedown',this._onClick);
    if(this._hiddenInput?.parentNode)this._hiddenInput.remove();
    gsap.killTweensOf(this.anim)}
  setUser(u){this.user=u}

  _animateMenu(){this.phase='menu';this.anim.menuA=0;this.anim.menuY=30;
    gsap.to(this.anim,{menuA:1,menuY:0,duration:0.6,ease:'back.out(1.4)',delay:0.1})}

  async _startGame(){if(!this.botDiff){gsap.fromTo(this.anim,{errorFlash:1},{errorFlash:0,duration:0.8});return}
    const m=this.W<600,hw=m?46:70,hh=m?53:80,sy=m?70:90;
    this.cells=buildGrid(this.W/2,sy,hw,hh);this.hexSize=m?24:36;
    const allQ=await loadQ();this.questions=shuffle(allQ).slice(0,TOTAL);this.qIdx=0;
    this.bot=new Bot(this.botDiff);this.turn='player';this.pScore=0;this.bScore=0;
    this.reportedQ=new Set();this._trans=false;this.stealPhase=false;
    gsap.to(this.anim,{menuA:0,menuY:-30,duration:0.3});
    setTimeout(()=>this._startCountdown(),350)}

  _startCountdown(){this.phase='countdown';this.countdownNum=3;this.anim.boardA=0;
    gsap.to(this.anim,{boardA:1,duration:0.8,delay:0.2});
    const t=()=>{if(this._dead)return;this.anim.countdownScale=0;
      gsap.fromTo(this.anim,{countdownScale:2},{countdownScale:1,duration:0.5,ease:'back.out(2)'});
      if(this.countdownNum<=0){this._startSelect();return}setTimeout(()=>{this.countdownNum--;t()},1000)};t()}

  _startSelect(){this.phase='selectHex';this.currentHex=null;this.typedAnswer='';this.answerResult=null;
    this.stealPhase=false;this._trans=false;this.anim.qA=0;this.anim.revealA=0;
    const free=this.cells.filter(c=>c.owner===null||c.owner==='black');
    if(free.length===0){this._showResult();return}
    if(this.turn==='bot'){const p=this.bot.pickHex(this.cells);if(!p){this._showResult();return}
      this._bt=setTimeout(()=>{if(!this._dead)this._selectHex(p.id)},800+Math.random()*1000)}
    this.anim.selectGlow=0;gsap.to(this.anim,{selectGlow:1,duration:0.5,repeat:-1,yoyo:true,ease:'sine.inOut'})}

  _selectHex(id){const c=this.cells.find(x=>x.id===id);if(!c||c.owner==='player'||c.owner==='bot')return;
    this.currentHex=c;gsap.killTweensOf(this.anim,'selectGlow');this.anim.selectGlow=0;
    this._startQuestion()}

  _startQuestion(){if(this.qIdx>=this.questions.length){this._showResult();return}
    this.phase='question';this.typedAnswer='';this.answerResult=null;this.timer=ROUND_TIME;this._trans=false;
    this.anim.qA=0;this.anim.qY=20;this.anim.revealA=0;
    gsap.to(this.anim,{qA:1,qY:0,duration:0.5,ease:'back.out(1.2)'});
    // Auto-focus hidden input for player's turn (mobile keyboard)
    if(this.turn==='player'&&this._hiddenInput){
      this._hiddenInput.value='';this._hiddenInput.style.pointerEvents='auto';
      setTimeout(()=>{if(!this._dead&&this.phase==='question'&&this.turn==='player')this._hiddenInput.focus()},100);
    }else if(this._hiddenInput){this._hiddenInput.blur();this._hiddenInput.style.pointerEvents='none'}
    if(this.turn==='bot'){const q=this.questions[this.qIdx];const ok=this.bot.willAnswer(q);
      this._bt=setTimeout(()=>{if(this._dead||this.phase!=='question')return;
        this.answerResult=ok?'correct':'wrong';this._doReveal()},this.bot.delay()*1000)}
    clearInterval(this._ti);this._ti=setInterval(()=>{if(this._dead||this.phase!=='question')return;
      this.timer-=0.1;if(this.timer<=0){this.timer=0;clearInterval(this._ti);
        if(this.turn==='player'&&!this.answerResult){this.answerResult='timeout';this._doReveal()}}},100)}

  _submitTyped(){if(this.phase!=='question'||this.turn!=='player'||this.answerResult)return;
    const q=this.questions[this.qIdx];const ok=checkAnswer(this.typedAnswer,q.a);
    this.answerResult=ok?'correct':'wrong';
    if(this._hiddenInput){this._hiddenInput.blur();this._hiddenInput.style.pointerEvents='none'}
    this._doReveal()}

  _doReveal(){if(this.phase!=='question')return;clearInterval(this._ti);clearTimeout(this._bt);
    this.phase='reveal';const correct=this.answerResult==='correct';
    gsap.to(this.anim,{revealA:1,duration:0.5});
    if(correct){// Hex goes to current turn
      this.currentHex.owner=this.turn;this.turn==='player'?this.pScore++:this.bScore++;this.qIdx++;
      setTimeout(()=>{if(this._dead)return;this._nextTurn()},1800);
    }else{// Wrong/timeout → steal opportunity for opponent
      this.qIdx++;
      if(this._hiddenInput){this._hiddenInput.blur();this._hiddenInput.style.pointerEvents='none'}
      setTimeout(()=>{if(this._dead)return;this._startSteal()},1500)}}

  _startSteal(){const opp=this.turn==='player'?'bot':'player';this.stealPhase=true;this.stealFor=opp;
    this.phase='steal';this.anim.qA=1;
    if(opp==='bot'){// Bot decides to steal or not
      const willSteal=this.bot.willSteal();
      this._bt=setTimeout(()=>{if(this._dead)return;
        if(willSteal){this.currentHex.owner='bot';this.bScore++;this._afterSteal()}
        else{this.currentHex.owner='black';this._afterSteal()}},1000+Math.random()*1500)}
    // If opp==='player', show steal buttons (yes/no) → handled in click
  }

  _playerStealYes(){if(this.phase!=='steal'||this.stealFor!=='player')return;
    this.currentHex.owner='player';this.pScore++;this._afterSteal()}
  _playerStealNo(){if(this.phase!=='steal'||this.stealFor!=='player')return;
    this.currentHex.owner='black';this._afterSteal()}

  _afterSteal(){this.stealPhase=false;
    this._trans=true;gsap.to(this.anim,{qA:0,qY:-30,duration:0.3,onComplete:()=>{
      if(this._dead)return;this._nextTurn()}})}

  _nextTurn(){const free=this.cells.filter(c=>c.owner===null||c.owner==='black');
    if(free.length===0||this.qIdx>=this.questions.length){this._showResult();return}
    this.turn=this.turn==='player'?'bot':'player';this._startSelect()}

  _showResult(){this.phase='result';this.anim.resultA=0;gsap.to(this.anim,{resultA:1,duration:0.6})}
  _leaveGame(){this.onBack()}
  async _reportQ(){const qi=Math.max(0,this.qIdx-1);const q=this.questions[qi];
    if(!q?.id||this.reportedQ.has(qi))return;this.reportedQ.add(qi);
    try{await supabase.from('quiz_questions').update({reported:true}).eq('id',q.id)}catch(e){}}

  _onKey(e){if(this.phase==='question'&&this.turn==='player'&&!this.answerResult){
    if(e.key==='Enter'){e.preventDefault();this._submitTyped();return}
    if(e.key==='Backspace'){this.typedAnswer=this.typedAnswer.slice(0,-1);
      if(this._hiddenInput)this._hiddenInput.value=this.typedAnswer;return}
    if(e.key.length===1&&this.typedAnswer.length<40){this.typedAnswer+=e.key;
      if(this._hiddenInput)this._hiddenInput.value=this.typedAnswer}}}

  _resize(){const r=this.canvas.getBoundingClientRect();this.W=r.width||window.innerWidth;this.H=r.height||window.innerHeight;
    this.canvas.width=this.W*this.dpr;this.canvas.height=this.H*this.dpr;
    if(this.cells.length>0){const m=this.W<600,hw=m?46:70,hh=m?53:80,sy=m?70:90;this.hexSize=m?24:36;
      const ow=this.cells.map(c=>c.owner);this.cells=buildGrid(this.W/2,sy,hw,hh);ow.forEach((o,i)=>{if(this.cells[i])this.cells[i].owner=o})}}
  _pos(e){const r=this.canvas.getBoundingClientRect();if(e.touches)return{x:e.touches[0].clientX-r.left,y:e.touches[0].clientY-r.top};return{x:e.clientX-r.left,y:e.clientY-r.top}}
  _hit(p,a){return a&&p.x>=a.x&&p.x<=a.x+a.w&&p.y>=a.y&&p.y<=a.y+a.h}

  _onMove(e){const p=this._pos(e);this.hoverHex=null;
    if(this.phase==='selectHex'&&this.turn==='player')for(const c of this.cells)
      if((c.owner===null||c.owner==='black')&&hexHit(c.x,c.y,this.hexSize,p.x,p.y)){this.hoverHex=c.id;break}
    for(let i=0;i<3;i++)gsap.to(this.anim.diffH,{[i]:this._hit(p,this.hits[`d${i}`])?1:0,duration:0.15});
    ['playH','backH','exitH','leaveH','reportH','stealYesH','stealNoH'].forEach(k=>
      gsap.to(this.anim,{[k]:this._hit(p,this.hits[k.replace('H','')])?1:0,duration:0.15}));
    const any=this.hoverHex!==null||Object.values(this.hits).some(a=>a&&this._hit(p,a));
    this.canvas.style.cursor=any?'pointer':'default'}

  _onClick(e){const p=this._pos(e);
    if(this.phase==='menu'){if(this._hit(p,this.hits.back)){this.onBack();return}
      if(this._hit(p,this.hits.play))this._startGame();
      ['easy','medium','hard'].forEach((d,i)=>{if(this._hit(p,this.hits[`d${i}`]))this.botDiff=d})}
    if(this.phase==='selectHex'&&this.turn==='player')
      for(const c of this.cells)if((c.owner===null||c.owner==='black')&&hexHit(c.x,c.y,this.hexSize,p.x,p.y)){this._selectHex(c.id);break}
    if(this.phase==='question'&&this.turn==='player'){if(this._hit(p,this.hits.submit))this._submitTyped()}
    if(this.phase==='steal'&&this.stealFor==='player'){
      if(this._hit(p,this.hits.stealYes))this._playerStealYes();if(this._hit(p,this.hits.stealNo))this._playerStealNo()}
    if(['question','reveal','selectHex','steal'].includes(this.phase)){
      if(this._hit(p,this.hits.leave))this._leaveGame();if(this._hit(p,this.hits.report))this._reportQ()}
    if(this.phase==='result'){if(this._hit(p,this.hits.exit))this.onBack();if(this._hit(p,this.hits.play))this._startGame()}}

  _loop(){if(this._dead)return;requestAnimationFrame(()=>this._loop());this._time+=0.016;
    this.ctx.setTransform(this.dpr,0,0,this.dpr,0,0);this._draw()}

  _draw(){const{ctx,W,H}=this;const bg=ctx.createLinearGradient(0,0,0,H);
    bg.addColorStop(0,'#010d04');bg.addColorStop(0.5,'#031a08');bg.addColorStop(1,'#010d04');
    ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
    if(this.phase==='menu')this._drawMenu();
    else if(this.phase==='countdown'){this._drawBoard();this._drawCD()}
    else if(this.phase==='selectHex'){this._drawSB();this._drawBoard();this._drawSelUI()}
    else if((this.phase==='question'||this.phase==='reveal')&&!this._trans){this._drawSB();this._drawBoard();this._drawQ()}
    else if(this.phase==='steal'){this._drawSB();this._drawBoard();this._drawSteal()}
    else if(this.phase==='result'){this._drawBoard();this._drawResult()}}

  _drawMenu(){const{ctx,W,anim}=this;const m=W<600,cx=W/2;
    ctx.save();ctx.globalAlpha=anim.menuA;ctx.translate(0,anim.menuY);
    const bb={x:16,y:16,w:90,h:36};this.hits.back=bb;rr(ctx,bb.x,bb.y,90,36,12);
    ctx.fillStyle=anim.backH?'rgba(255,255,255,0.08)':'rgba(255,255,255,0.03)';ctx.fill();
    rr(ctx,bb.x,bb.y,90,36,12);ctx.strokeStyle='rgba(255,255,255,0.1)';ctx.lineWidth=1;ctx.stroke();
    ctx.font='600 13px Inter,system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillStyle=C.muted;ctx.fillText('← Späť',bb.x+45,bb.y+18);
    drawHex(ctx,cx,m?80:95,m?28:38,C.greenD,C.green,2,'rgba(34,197,94,0.3)');
    const ty=m?130:155;ctx.font=`900 ${m?28:42}px Inter,system-ui,sans-serif`;
    ctx.shadowColor=C.green;ctx.shadowBlur=25;ctx.fillStyle=C.greenL;ctx.fillText('KVÍZ DUEL',cx,ty);ctx.shadowBlur=0;
    ctx.font=`500 ${m?11:14}px Inter,system-ui,sans-serif`;ctx.fillStyle=C.muted;
    ctx.fillText('AZ Kvíz • Hexagony • Píš odpoveď!',cx,ty+(m?28:35));
    const ry=ty+(m?52:65);ctx.font=`500 ${m?10:12}px Inter,system-ui,sans-serif`;ctx.fillStyle=hex2rgba(C.greenL,0.6);
    ['🟦 Ty hráš modrou (zhora → nadol)','🟧 BOT hrá oranžovou (zľava → doprava)',
     '✍️ Odpoveď napíš na klávesnici','❌ Zlé → súper môže prevziať alebo čierne pole'].forEach((r,i)=>ctx.fillText(r,cx,ry+i*(m?18:22)));
    const diffs=['Ľahký','Stredný','Ťažký'],dk=['easy','medium','hard'],dc=[C.greenL,C.gold,C.red];
    const dbw=m?82:100,dbh=38,dgap=8,dtw=dbw*3+dgap*2,dsy=ry+4*(m?18:22)+(m?18:25);
    ctx.font='600 11px Inter,system-ui,sans-serif';
    ctx.fillStyle=anim.errorFlash>0?`rgba(239,68,68,${anim.errorFlash})`:hex2rgba(C.text,0.4);
    ctx.fillText(this.botDiff?'Obtiažnosť BOTa':'⚠️ Vyber obtiažnosť!',cx,dsy-14);
    for(let i=0;i<3;i++){const dx=cx-dtw/2+i*(dbw+dgap);this.hits[`d${i}`]={x:dx,y:dsy,w:dbw,h:dbh};
      const act=this.botDiff===dk[i],hv=this.anim.diffH[i];
      rr(ctx,dx,dsy,dbw,dbh,12);ctx.fillStyle=act?hex2rgba(dc[i],0.2):`rgba(255,255,255,${0.03+hv*0.05})`;ctx.fill();
      rr(ctx,dx,dsy,dbw,dbh,12);ctx.strokeStyle=act?dc[i]:`rgba(255,255,255,${0.1+hv*0.1})`;ctx.lineWidth=act?2:1;ctx.stroke();
      ctx.font=`${act?700:500} 13px Inter,system-ui,sans-serif`;ctx.fillStyle=act?dc[i]:`rgba(255,255,255,${0.6+hv*0.3})`;
      ctx.fillText(diffs[i],dx+dbw/2,dsy+dbh/2)}
    const pbw=220,pbh=52,pb={x:cx-pbw/2,y:dsy+dbh+30,w:pbw,h:pbh};this.hits.play=pb;
    const cp=!!this.botDiff;ctx.shadowColor=cp?C.green:'#222';ctx.shadowBlur=cp?10+anim.playH*18:0;
    const g=ctx.createLinearGradient(pb.x,pb.y,pb.x,pb.y+pbh);
    if(cp){g.addColorStop(0,anim.playH?C.greenL:C.green);g.addColorStop(1,anim.playH?C.green:C.greenD)}
    else{g.addColorStop(0,'#333');g.addColorStop(1,'#222')}
    rr(ctx,pb.x,pb.y,pbw,pbh,16);ctx.fillStyle=g;ctx.fill();ctx.shadowBlur=0;
    ctx.font='800 18px Inter,system-ui,sans-serif';ctx.fillStyle=cp?'#000':'#555';ctx.fillText('⬡ HRAŤ vs BOT',cx,pb.y+pbh/2);
    ctx.restore()}

  _drawBoard(){const{ctx,anim}=this;const m=this.W<600;ctx.save();ctx.globalAlpha=anim.boardA;
    for(const c of this.cells){let fill,stroke,glow=null,lw=1.5;const hov=this.hoverHex===c.id;
      const sel=this.currentHex&&this.currentHex.id===c.id;
      if(c.owner==='player'){fill=hex2rgba(C.blue,0.35);stroke=C.blue;glow=C.blueGlow;lw=2}
      else if(c.owner==='bot'){fill=hex2rgba(C.orange,0.35);stroke=C.orange;glow=C.orangeGlow;lw=2}
      else if(c.owner==='black'){fill='#111';stroke='#333';lw=1}
      else if(sel){fill=hex2rgba(C.greenL,0.3);stroke=C.greenL;glow='rgba(74,222,128,0.4)';lw=2.5}
      else if(hov){fill=C.hexHov;stroke=C.greenL;lw=2}
      else{fill=C.hexN;stroke=C.hexB}
      drawHex(ctx,c.x,c.y,this.hexSize,fill,stroke,lw,glow);
      ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.font=`700 ${this.hexSize>30?13:9}px Inter,system-ui,sans-serif`;
      if(c.owner==='player'){ctx.fillStyle=C.blueL;ctx.fillText('👤',c.x,c.y)}
      else if(c.owner==='bot'){ctx.fillStyle=C.orangeL;ctx.fillText('🤖',c.x,c.y)}
      else if(c.owner==='black'){ctx.fillStyle='#444';ctx.fillText('✕',c.x,c.y)}
      else{ctx.fillStyle=hex2rgba(C.greenL,0.5);ctx.fillText(`${c.num}`,c.x,c.y)}}
    ctx.restore()}

  _drawSB(){const{ctx,W}=this;const m=W<600,y=m?18:24;ctx.textBaseline='middle';ctx.textAlign='center';
    ctx.font=`700 ${m?12:14}px Inter,system-ui,sans-serif`;ctx.fillStyle=C.blueL;ctx.fillText('👤 Ty',W/2-(m?60:80),y);
    ctx.font=`900 ${m?18:22}px Inter,system-ui,sans-serif`;ctx.fillStyle='#fff';ctx.fillText(`${this.pScore}`,W/2-(m?30:40),y);
    ctx.font=`700 ${m?10:13}px Inter,system-ui,sans-serif`;ctx.fillStyle=C.dim;ctx.fillText('vs',W/2,y);
    ctx.fillStyle='#fff';ctx.font=`900 ${m?18:22}px Inter,system-ui,sans-serif`;ctx.fillText(`${this.bScore}`,W/2+(m?30:40),y);
    ctx.font=`700 ${m?12:14}px Inter,system-ui,sans-serif`;ctx.fillStyle=C.orangeL;ctx.fillText('🤖 BOT',W/2+(m?65:85),y)}

  _drawSelUI(){const{ctx,W,H,anim}=this;const m=W<600,cx=W/2;
    const bb=this.cells[this.cells.length-1]?.y+this.hexSize+20||H*0.6;
    ctx.textAlign='center';ctx.textBaseline='middle';const ga=0.5+anim.selectGlow*0.5;
    if(this.turn==='player'){ctx.font=`700 ${m?14:18}px Inter,system-ui,sans-serif`;ctx.fillStyle=`rgba(59,130,246,${ga})`;ctx.fillText('🎯 Vyber si hexagon!',cx,bb)}
    else{ctx.font=`700 ${m?14:18}px Inter,system-ui,sans-serif`;ctx.fillStyle=`rgba(245,158,11,${ga})`;ctx.fillText('🤖 BOT vyberá...',cx,bb)}
    const lbw=m?80:100,lbh=30,leave={x:cx-lbw/2,y:bb+25,w:lbw,h:lbh};this.hits.leave=leave;
    rr(ctx,leave.x,leave.y,lbw,lbh,10);ctx.fillStyle=anim.leaveH?'rgba(239,68,68,0.12)':'rgba(255,255,255,0.03)';ctx.fill();
    rr(ctx,leave.x,leave.y,lbw,lbh,10);ctx.strokeStyle=anim.leaveH?C.red:'rgba(255,255,255,0.08)';ctx.lineWidth=1;ctx.stroke();
    ctx.font=`600 ${m?10:11}px Inter,system-ui,sans-serif`;ctx.fillStyle=anim.leaveH?C.redL:C.dim;ctx.fillText('🚪 Odísť',leave.x+lbw/2,leave.y+lbh/2)}

  _drawCD(){const{ctx,W,H,anim}=this;ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.save();ctx.translate(W/2,H/2);ctx.scale(anim.countdownScale,anim.countdownScale);
    ctx.font='900 100px Inter,system-ui,sans-serif';ctx.fillStyle=C.greenL;ctx.shadowColor=C.green;ctx.shadowBlur=30;
    ctx.fillText(this.countdownNum>0?`${this.countdownNum}`:'GO!',0,0);ctx.restore()}

  _drawQ(){const{ctx,W,H,anim}=this;const m=W<600,cx=W/2;
    const q=this.questions[this.phase==='reveal'?Math.max(0,this.qIdx-1):this.qIdx];if(!q)return;
    const bb=this.cells[this.cells.length-1]?.y+this.hexSize+10||H*0.55;
    ctx.save();ctx.globalAlpha=anim.qA;ctx.translate(0,anim.qY);ctx.textAlign='center';ctx.textBaseline='middle';
    const tc=this.turn==='player'?C.blueL:C.orangeL;
    ctx.font=`600 ${m?10:12}px Inter,system-ui,sans-serif`;ctx.fillStyle=tc;
    ctx.fillText(this.turn==='player'?'🟦 Tvoj ťah – napíš odpoveď':'🟧 BOT odpovedá...',cx,bb-2);
    // Timer
    const tw=m?Math.min(W-40,180):200,th=4,ty=bb+10,pct=Math.max(0,this.timer/ROUND_TIME);
    rr(ctx,cx-tw/2,ty,tw,th,3);ctx.fillStyle='#1a1a1a';ctx.fill();
    if(pct>0){rr(ctx,cx-tw/2,ty,tw*pct,th,3);ctx.fillStyle=pct>0.3?C.green:C.red;ctx.fill()}
    ctx.font=`700 ${m?10:12}px Inter,system-ui,sans-serif`;ctx.fillStyle=pct>0.3?C.muted:C.red;ctx.fillText(`${Math.ceil(this.timer)}s`,cx,ty+14);
    // Question
    const qcw=Math.min(W-24,460),qch=m?55:65,qcy=ty+28;
    rr(ctx,cx-qcw/2,qcy,qcw,qch,14);ctx.fillStyle=hex2rgba(C.green,0.06);ctx.fill();
    rr(ctx,cx-qcw/2,qcy,qcw,qch,14);ctx.strokeStyle=hex2rgba(C.green,0.2);ctx.lineWidth=1;ctx.stroke();
    ctx.font=`700 ${m?13:16}px Inter,system-ui,sans-serif`;ctx.fillStyle=C.text;
    const words=q.q.split(' ');let line='',lines=[];
    for(const w of words){const t=line?line+' '+w:w;if(ctx.measureText(t).width>qcw-30&&line){lines.push(line);line=w}else line=t}
    if(line)lines.push(line);const lh=m?18:22;lines.forEach((l,i)=>ctx.fillText(l,cx,qcy+qch/2-(lines.length-1)*lh/2+i*lh));
    // Input or result
    const iw=Math.min(W-24,340),ih=44,iy=qcy+qch+12;
    if(this.phase==='question'&&this.turn==='player'){
      rr(ctx,cx-iw/2,iy,iw,ih,12);ctx.fillStyle='rgba(255,255,255,0.06)';ctx.fill();
      rr(ctx,cx-iw/2,iy,iw,ih,12);ctx.strokeStyle=hex2rgba(C.blue,0.4);ctx.lineWidth=1.5;ctx.stroke();
      ctx.font=`500 ${m?14:16}px Inter,system-ui,sans-serif`;ctx.fillStyle=this.typedAnswer?C.text:'rgba(255,255,255,0.3)';
      ctx.fillText(this.typedAnswer||'Napíš odpoveď...',cx,iy+ih/2);
      const cursor=Math.sin(this._time*4)>0?'|':'';if(this.typedAnswer)
        ctx.fillText(cursor,cx+ctx.measureText(this.typedAnswer).width/2+3,iy+ih/2);
      // Submit btn
      const sbw=m?100:120,sbh=38,sb={x:cx-sbw/2,y:iy+ih+10,w:sbw,h:sbh};this.hits.submit=sb;
      rr(ctx,sb.x,sb.y,sbw,sbh,12);ctx.fillStyle=this.typedAnswer?hex2rgba(C.green,0.2):'rgba(255,255,255,0.03)';ctx.fill();
      rr(ctx,sb.x,sb.y,sbw,sbh,12);ctx.strokeStyle=this.typedAnswer?C.green:'rgba(255,255,255,0.1)';ctx.lineWidth=1;ctx.stroke();
      ctx.font='700 13px Inter,system-ui,sans-serif';ctx.fillStyle=this.typedAnswer?C.greenL:C.dim;ctx.fillText('Enter ⏎',sb.x+sbw/2,sb.y+sbh/2)}
    if(this.phase==='reveal'){
      const ok=this.answerResult==='correct';
      rr(ctx,cx-iw/2,iy,iw,ih,12);ctx.fillStyle=hex2rgba(ok?C.green:C.red,0.15);ctx.fill();
      rr(ctx,cx-iw/2,iy,iw,ih,12);ctx.strokeStyle=ok?C.green:C.red;ctx.lineWidth=2;ctx.stroke();
      ctx.font=`700 ${m?14:16}px Inter,system-ui,sans-serif`;ctx.fillStyle=ok?C.greenL:C.redL;
      ctx.fillText(ok?'✅ Správne!':`❌ Správna: ${q.a}`,cx,iy+ih/2)}
    // Leave+Report
    const btnY=iy+ih+(this.phase==='question'&&this.turn==='player'?58:16);
    const lbw=m?75:95,lbh=28;
    const leave={x:cx-lbw-4,y:btnY,w:lbw,h:lbh};this.hits.leave=leave;
    rr(ctx,leave.x,leave.y,lbw,lbh,10);ctx.fillStyle=anim.leaveH?'rgba(239,68,68,0.12)':'rgba(255,255,255,0.03)';ctx.fill();
    rr(ctx,leave.x,leave.y,lbw,lbh,10);ctx.strokeStyle=anim.leaveH?C.red:'rgba(255,255,255,0.08)';ctx.lineWidth=1;ctx.stroke();
    ctx.font=`600 ${m?9:10}px Inter,system-ui,sans-serif`;ctx.fillStyle=anim.leaveH?C.redL:C.dim;ctx.fillText('🚪 Odísť',leave.x+lbw/2,leave.y+lbh/2);
    const qi=this.phase==='reveal'?Math.max(0,this.qIdx-1):this.qIdx;const rptd=this.reportedQ.has(qi);
    const rpt={x:cx+4,y:btnY,w:lbw,h:lbh};this.hits.report=rpt;
    rr(ctx,rpt.x,rpt.y,lbw,lbh,10);ctx.fillStyle=rptd?'rgba(239,68,68,0.1)':anim.reportH?'rgba(251,191,36,0.1)':'rgba(255,255,255,0.03)';ctx.fill();
    rr(ctx,rpt.x,rpt.y,lbw,lbh,10);ctx.strokeStyle=rptd?C.red:anim.reportH?C.gold:'rgba(255,255,255,0.08)';ctx.lineWidth=1;ctx.stroke();
    ctx.fillStyle=rptd?C.redL:anim.reportH?C.goldL:C.dim;ctx.fillText(rptd?'⚠️ Nahlásené':'⚠️ Nahlásiť',rpt.x+lbw/2,rpt.y+lbh/2);
    ctx.restore()}

  _drawSteal(){const{ctx,W,H,anim}=this;const m=W<600,cx=W/2;
    const bb=this.cells[this.cells.length-1]?.y+this.hexSize+20||H*0.6;
    ctx.textAlign='center';ctx.textBaseline='middle';
    if(this.stealFor==='bot'){ctx.font=`700 ${m?14:16}px Inter,system-ui,sans-serif`;ctx.fillStyle=C.orangeL;
      ctx.fillText('🤖 BOT rozhoduje o prevzatí...',cx,bb)}
    else{ctx.font=`700 ${m?14:16}px Inter,system-ui,sans-serif`;ctx.fillStyle=C.blueL;
      ctx.fillText('❓ Chceš prevziať tento hexagon?',cx,bb);
      const bw=m?100:130,bh=42,gap=12;
      const yes={x:cx-bw-gap/2,y:bb+20,w:bw,h:bh};this.hits.stealYes=yes;
      rr(ctx,yes.x,yes.y,bw,bh,14);ctx.fillStyle=hex2rgba(C.green,0.15+anim.stealYesH*0.15);ctx.fill();
      rr(ctx,yes.x,yes.y,bw,bh,14);ctx.strokeStyle=C.green;ctx.lineWidth=1.5;ctx.stroke();
      ctx.font='700 14px Inter,system-ui,sans-serif';ctx.fillStyle=C.greenL;ctx.fillText('✅ Áno',yes.x+bw/2,yes.y+bh/2);
      const no={x:cx+gap/2,y:bb+20,w:bw,h:bh};this.hits.stealNo=no;
      rr(ctx,no.x,no.y,bw,bh,14);ctx.fillStyle=hex2rgba(C.red,0.1+anim.stealNoH*0.1);ctx.fill();
      rr(ctx,no.x,no.y,bw,bh,14);ctx.strokeStyle=C.red;ctx.lineWidth=1.5;ctx.stroke();
      ctx.fillStyle=C.redL;ctx.fillText('❌ Nie (čierne)',no.x+bw/2,no.y+bh/2)}
    // Leave
    const lbw=m?80:100,lbh=30,leave={x:cx-lbw/2,y:bb+80,w:lbw,h:lbh};this.hits.leave=leave;
    rr(ctx,leave.x,leave.y,lbw,lbh,10);ctx.fillStyle=anim.leaveH?'rgba(239,68,68,0.12)':'rgba(255,255,255,0.03)';ctx.fill();
    rr(ctx,leave.x,leave.y,lbw,lbh,10);ctx.strokeStyle=anim.leaveH?C.red:'rgba(255,255,255,0.08)';ctx.lineWidth=1;ctx.stroke();
    ctx.font=`600 ${m?10:11}px Inter,system-ui,sans-serif`;ctx.fillStyle=anim.leaveH?C.redL:C.dim;ctx.fillText('🚪 Odísť',leave.x+lbw/2,leave.y+lbh/2)}

  _drawResult(){const{ctx,W,H,anim}=this;const m=W<600;ctx.save();ctx.globalAlpha=anim.resultA;
    ctx.fillStyle='rgba(0,0,0,0.85)';ctx.fillRect(0,0,W,H);const cx=W/2,cy=H/2;
    const pw=Math.min(400,W-24),ph=m?300:320,px=cx-pw/2,py=cy-ph/2;
    rr(ctx,px,py,pw,ph,24);const bg=ctx.createLinearGradient(px,py,px,py+ph);bg.addColorStop(0,'#071a0a');bg.addColorStop(1,'#020d04');ctx.fillStyle=bg;ctx.fill();
    const won=this.pScore>this.bScore,tied=this.pScore===this.bScore,bc=won?C.green:tied?C.gold:C.red;
    rr(ctx,px,py,pw,ph,24);ctx.strokeStyle=bc;ctx.lineWidth=2;ctx.stroke();
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.font=`900 ${m?28:34}px Inter,system-ui,sans-serif`;ctx.shadowColor=bc;ctx.shadowBlur=20;ctx.fillStyle=bc;
    ctx.fillText(won?'🏆 VÝHRA!':tied?'🤝 REMÍZA':'😞 PREHRA',cx,py+55);ctx.shadowBlur=0;
    ctx.font=`700 ${m?13:16}px Inter,system-ui,sans-serif`;ctx.fillStyle=C.blueL;ctx.fillText('👤 Ty',cx-60,py+95);
    ctx.fillStyle=C.orangeL;ctx.fillText('🤖 BOT',cx+60,py+95);
    ctx.font=`900 ${m?36:44}px Inter,system-ui,sans-serif`;ctx.fillStyle='#fff';
    ctx.fillText(`${this.pScore}`,cx-60,py+135);ctx.fillText(`${this.bScore}`,cx+60,py+135);
    ctx.font='700 20px Inter,system-ui,sans-serif';ctx.fillStyle=C.dim;ctx.fillText(':',cx,py+130);
    const bbw=155,bbh=42;const pb={x:cx-bbw-6,y:py+ph-60,w:bbw,h:bbh};this.hits.play=pb;
    rr(ctx,pb.x,pb.y,bbw,bbh,14);ctx.fillStyle=hex2rgba(C.green,0.15+anim.playH*0.15);ctx.fill();
    rr(ctx,pb.x,pb.y,bbw,bbh,14);ctx.strokeStyle=C.green;ctx.lineWidth=1.5;ctx.stroke();
    ctx.font='700 13px Inter,system-ui,sans-serif';ctx.fillStyle=C.greenL;ctx.fillText('🔄 Hrať znova',pb.x+bbw/2,pb.y+bbh/2);
    const eb={x:cx+6,y:py+ph-60,w:bbw,h:bbh};this.hits.exit=eb;
    rr(ctx,eb.x,eb.y,bbw,bbh,14);ctx.fillStyle=hex2rgba(C.gold,0.1+anim.exitH*0.1);ctx.fill();
    rr(ctx,eb.x,eb.y,bbw,bbh,14);ctx.strokeStyle=C.gold;ctx.lineWidth=1.5;ctx.stroke();
    ctx.fillStyle=C.goldL;ctx.fillText('🔙 Menu',eb.x+bbw/2,eb.y+bbh/2);ctx.restore()}
}
