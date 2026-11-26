(() => {
  'use strict';
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = 480, H = 854;
  const $ = id => document.getElementById(id);
  const ui = Object.fromEntries(['menu','hud','score','wave','lives','soundBtn','pauseBtn','pauseScreen','gameOverScreen','inGameControls','bombBtn','bombCount','stageMessage','finalScore','finalBest','menuBest','difficultyName','bestDifficulty','hudDifficulty','finalDifficulty'].map(id => [id,$(id)]));
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const rand = (a,b) => a + Math.random() * (b-a);
  const format = n => Math.floor(n).toString().padStart(6,'0');
  const show = (el, visible) => el.classList.toggle('hide',!visible);
  // Level 1 intentionally retains every original gameplay multiplier.
  const difficulties = [
    {name:'原始', bulletSpeed:1, diveInterval:1, diveSpeed:1, extraDivers:0, fireChance:.18, fireCooldown:1, fromWave:2, bossInterval:1, bossSpread:2, bossHealth:0},
    {name:'標準', bulletSpeed:1.10, diveInterval:.84, diveSpeed:1.07, extraDivers:0, fireChance:.24, fireCooldown:.90, fromWave:1, bossInterval:.90, bossSpread:2, bossHealth:12},
    {name:'進階', bulletSpeed:1.22, diveInterval:.72, diveSpeed:1.15, extraDivers:1, fireChance:.32, fireCooldown:.80, fromWave:1, bossInterval:.80, bossSpread:3, bossHealth:26},
    {name:'困難', bulletSpeed:1.35, diveInterval:.61, diveSpeed:1.25, extraDivers:1, fireChance:.42, fireCooldown:.72, fromWave:1, bossInterval:.70, bossSpread:3, bossHealth:42},
    {name:'極限', bulletSpeed:1.50, diveInterval:.50, diveSpeed:1.35, extraDivers:2, fireChance:.55, fireCooldown:.62, fromWave:1, bossInterval:.60, bossSpread:4, bossHealth:60}
  ];
  const bestKey = level => level===1 ? 'starwing-best' : `starwing-best-level-${level}`;
  const readBest = level => { try { return Math.max(0,Number(localStorage.getItem(bestKey(level)))||0); } catch (_) { return 0; } };
  const writeBest = (level,n) => { try { localStorage.setItem(bestKey(level),String(n)); } catch (_) {} };
  const readDifficulty = () => { try { const level=Number(localStorage.getItem('starwing-difficulty')); return Number.isInteger(level)&&level>=1&&level<=5 ? level : 1; } catch (_) { return 1; } };
  let selectedDifficulty = readDifficulty();
  let best = readBest(selectedDifficulty);

  // Original, browser-synthesized chiptune and arcade effects. No audio files or network required.
  const audio = {
    ctx:null, master:null, music:null, effects:null, timer:null, next:0, step:0, playing:false, muted:false,
    init() {
      try {
        if (!this.ctx) {
          const AudioContextClass = window.AudioContext || window.webkitAudioContext;
          if (!AudioContextClass) return;
          this.ctx = new AudioContextClass();
          const compressor = this.ctx.createDynamicsCompressor();
          compressor.threshold.value = -12; compressor.knee.value = 8; compressor.ratio.value = 5;
          this.master = this.ctx.createGain(); this.master.gain.value = this.muted ? 0 : .55;
          this.music = this.ctx.createGain(); this.music.gain.value = .48;
          this.effects = this.ctx.createGain(); this.effects.gain.value = .80;
          this.music.connect(this.master); this.effects.connect(this.master); this.master.connect(compressor); compressor.connect(this.ctx.destination);
          this.timer = setInterval(() => this.schedule(),80);
        }
        if (this.ctx.state === 'suspended') this.ctx.resume().catch(()=>{});
      } catch (_) {}
    },
    setMuted(value) { this.muted = value; if(this.master&&this.ctx) this.master.gain.setTargetAtTime(value ? 0 : .55,this.ctx.currentTime,.03); },
    begin() { this.init(); this.playing = true; if(this.ctx) this.next = this.ctx.currentTime + .06; },
    stop() { this.playing = false; },
    note(freq, time, dur, type, vol, bus, endFreq) {
      if (!this.ctx || !freq) return;
      try {
        const o=this.ctx.createOscillator(), g=this.ctx.createGain();
        o.type=type; o.frequency.setValueAtTime(freq,time);
        if(endFreq) o.frequency.exponentialRampToValueAtTime(Math.max(20,endFreq),time+dur);
        g.gain.setValueAtTime(.0001,time); g.gain.exponentialRampToValueAtTime(Math.max(.0002,vol),time+.008); g.gain.exponentialRampToValueAtTime(.0001,time+dur);
        o.connect(g); g.connect(bus); o.start(time); o.stop(time+dur+.01);
      } catch (_) {}
    },
    sfx(kind) {
      if(!this.ctx || this.muted) return;
      const t=this.ctx.currentTime, fx=this.effects;
      if(kind==='shoot') this.note(820,t,.06,'square',.045,fx,430);
      else if(kind==='hit') { this.note(150,t,.23,'sawtooth',.15,fx,45); this.note(75,t,.28,'square',.10,fx,30); }
      else if(kind==='explode') { this.note(rand(130,190),t,.12,'sawtooth',.085,fx,45); }
      else if(kind==='pickup') { this.note(660,t,.09,'square',.10,fx); this.note(990,t+.07,.13,'square',.10,fx); }
      else if(kind==='bomb') { this.note(180,t,.45,'sawtooth',.15,fx,35); this.note(90,t,.55,'triangle',.16,fx,30); }
      else if(kind==='start') { [440,554,659,880].forEach((f,i)=>this.note(f,t+i*.075,.14,'square',.095,fx)); }
      else if(kind==='wave') { [523,659,784].forEach((f,i)=>this.note(f,t+i*.1,.16,'triangle',.10,fx)); }
      else if(kind==='over') { [440,392,330,220].forEach((f,i)=>this.note(f,t+i*.13,.22,'square',.085,fx)); }
    },
    schedule() {
      if(!this.ctx || !this.playing || this.ctx.state!=='running') return;
      if(this.next < this.ctx.currentTime-.2) this.next=this.ctx.currentTime+.03;
      // Two-bar melody, with a contrasting second phrase; 150 BPM.
      const melody=[659,0,784,0,880,0,784,659, 587,0,659,0,784,0,659,587, 523,0,659,0,784,0,880,0, 988,880,784,659,587,0,659,0,
                    659,0,784,0,880,0,988,880, 784,0,659,0,587,0,659,784, 880,0,784,0,659,0,587,0, 523,659,784,659,587,0,523,0];
      const bass=[110,110,130.81,130.81,146.83,146.83,98,98];
      while(this.next < this.ctx.currentTime+.16) {
        const s=this.step%64, t=this.next;
        if(melody[s]) this.note(melody[s],t,.12,'square',.047,this.music);
        if(s%4===0) { this.note(bass[Math.floor(s/8)],t,.19,'triangle',.095,this.music); this.note(85,t,.10,'sine',.12,this.music,42); }
        if(s%8===4) this.note(170,t,.055,'square',.025,this.music,80);
        if(s%2===0) this.note(4800,t,.025,'triangle',.008,this.music,2000);
        this.step++; this.next+=.10;
      }
    }
  };

  const bg = new Image();
  const bgCache = document.createElement('canvas'); bgCache.width=W; bgCache.height=H; let bgReady=false;
  bg.onload = () => { const bctx=bgCache.getContext('2d'); bctx.drawImage(bg,0,0,W,H); bgReady=true; };
  bg.src = 'space-bg.png';
  // Poster art is prepared once into small canvases for smooth mobile rendering.
  const characterArt = {ship:null, bees:{}, beeFull:{}, cans:{}};
  const beeCells={gold:[49,90,579,418],pink:[676,92,535,410],blue:[52,698,546,411],boss:[618,612,621,516]};
  // Each wing is a real separate image layer with its own attachment point.
  const wingCells={
    gold:{left:{rect:[50,135,194,170],pivot:[234,255]},right:{rect:[431,130,197,173],pivot:[441,255]}},
    pink:{left:{rect:[676,149,173,157],pivot:[839,262]},right:{rect:[1030,149,181,157],pivot:[1040,262]}},
    blue:{left:{rect:[52,754,183,159],pivot:[225,868]},right:{rect:[415,753,183,159],pivot:[425,867]}},
    boss:{left:{rect:[618,683,216,264],pivot:[810,836]},right:{rect:[1027,682,212,263],pivot:[1051,834]}}
  };
  function cacheSprite(image, rect, width=160) {
    const height=Math.max(1,Math.round(width*rect[3]/rect[2]));
    const layer=document.createElement('canvas'); layer.width=width; layer.height=height;
    layer.getContext('2d').drawImage(image,rect[0],rect[1],rect[2],rect[3],0,0,width,height);
    return layer;
  }
  function cacheWing(full,bodies,wing) {
    const [x,y,w,h]=wing.rect, width=120, height=Math.max(1,Math.round(width*h/w));
    const layer=document.createElement('canvas');layer.width=width;layer.height=height;
    const c=layer.getContext('2d');c.drawImage(full,x,y,w,h,0,0,width,height);
    // Remove the stationary body from the wing layer so its edges cannot swing with the wings.
    c.globalCompositeOperation='destination-out';c.drawImage(bodies,x,y,w,h,0,0,width,height);c.globalCompositeOperation='source-over';
    return {image:layer,rect:wing.rect,pivot:wing.pivot};
  }
  const shipImage=new Image();
  shipImage.onload=()=>{characterArt.ship=cacheSprite(shipImage,[10,320,920,915]);};
  shipImage.src='sprites-ship.png';
  const beeImage=new Image(),beeBodyImage=new Image();let beeReady=false,bodyReady=false;
  function prepareBeeParts() {
    if(!beeReady||!bodyReady)return;
    for(const [type,rect] of Object.entries(beeCells)) {
      characterArt.bees[type]={rect,body:cacheSprite(beeBodyImage,rect),
        left:cacheWing(beeImage,beeBodyImage,wingCells[type].left),
        right:cacheWing(beeImage,beeBodyImage,wingCells[type].right)};
    }
  }
  beeImage.onload=()=>{beeReady=true;for(const [type,rect] of Object.entries(beeCells))characterArt.beeFull[type]=cacheSprite(beeImage,rect);prepareBeeParts();};
  beeBodyImage.onload=()=>{bodyReady=true;prepareBeeParts();};
  beeImage.src='sprites-bees.png';beeBodyImage.src='sprites-bee-bodies.png';
  const canImage=new Image();
  canImage.onload=()=>{const cells={P:[240,40,420,620],B:[880,40,420,620],H:[1520,40,420,620]};for(const [type,rect] of Object.entries(cells))characterArt.cans[type]=cacheSprite(canImage,rect,100);};
  canImage.src='sprites-powerups.png';
  const stars = Array.from({length:105},()=>({x:rand(0,W),y:rand(0,H),r:rand(.4,1.7),speed:rand(10,50),alpha:rand(.18,.9)}));
  const state = { mode:'menu',difficulty:1,time:0,wave:0,score:0,lives:3,bombs:1,power:0,player:null,enemies:[],shots:[],bullets:[],pickups:[],particles:[],texts:[],waveWait:0,diveTimer:0,stageTime:0,shake:0,flash:0,kills:0,pointer:false,keys:new Set(),last:0 };

  function setDifficulty(level) {
    if(state.mode!=='menu' || !Number.isInteger(level) || level<1 || level>5) return;
    selectedDifficulty=level; best=readBest(level);
    try { localStorage.setItem('starwing-difficulty',String(level)); } catch (_) {}
    ui.difficultyName.textContent=`LV.${level} · ${difficulties[level-1].name}`;
    ui.bestDifficulty.textContent=`LV.${level}`;
    ui.menuBest.textContent=format(best);
    document.querySelectorAll('.difficulty-option').forEach(button => button.setAttribute('aria-pressed',String(Number(button.dataset.difficulty)===level)));
  }
  function syncHud() {
    ui.score.textContent=format(state.score); ui.wave.textContent=String(state.wave).padStart(2,'0'); ui.hudDifficulty.textContent=`LV.${state.difficulty}`;
    ui.lives.textContent=state.lives>0 ? '♥ '.repeat(state.lives).trim() : '—';
    ui.bombCount.textContent=String(state.bombs); ui.bombBtn.disabled=state.bombs<=0;
  }
  function setMode(mode) {
    state.mode=mode; ui.pauseBtn.setAttribute('aria-label',mode==='paused'?'繼續遊戲':'暫停遊戲');
    show(ui.menu,mode==='menu'); show(ui.hud,mode==='playing'||mode==='paused');
    show(ui.pauseBtn,mode==='playing'||mode==='paused'); show(ui.inGameControls,mode==='playing');
    show(ui.pauseScreen,mode==='paused'); show(ui.gameOverScreen,mode==='gameover');
    if(mode!=='playing') show(ui.stageMessage,false);
  }
  function makePlayer() { return {x:W/2,y:700,targetX:W/2,invuln:2.1,fireTimer:0}; }
  function startGame() {
    audio.init(); audio.sfx('start'); audio.begin();
    Object.assign(state,{difficulty:selectedDifficulty,time:0,wave:0,score:0,lives:3,bombs:1,power:0,player:makePlayer(),enemies:[],shots:[],bullets:[],pickups:[],particles:[],texts:[],waveWait:0,diveTimer:2.8,stageTime:0,shake:0,flash:0,kills:0,pointer:false});
    state.keys.clear(); setMode('playing'); spawnWave(); syncHud();
  }
  function goHome() {
    audio.stop(); state.enemies=[]; state.bullets=[]; state.shots=[]; state.pickups=[]; state.particles=[]; state.texts=[]; state.keys.clear(); state.pointer=false;
    ui.menuBest.textContent=format(best); setMode('menu');
  }
  function togglePause() {
    if(state.mode==='playing') { state.keys.clear(); state.pointer=false; audio.stop(); setMode('paused'); }
    else if(state.mode==='paused') { setMode('playing'); audio.begin(); }
  }
  function gameOver() {
    audio.stop(); audio.sfx('over');
    if(state.score>best) { best=state.score; writeBest(state.difficulty,best); }
    ui.finalDifficulty.textContent=`LV.${state.difficulty}`; ui.finalScore.textContent=format(state.score); ui.finalBest.textContent=format(best);
    setMode('gameover');
  }
  function spawnWave() {
    state.wave++; state.enemies=[]; state.bullets=[]; state.waveWait=0; state.stageTime=2.3; state.diveTimer=3.1;
    if(state.wave%3===0) {
      const bossHealth=34+state.wave*4+difficulties[state.difficulty-1].bossHealth;
      state.enemies.push({boss:true,x:W/2,y:188,homeY:190,hp:bossHealth,maxHp:bossHealth,fire:1.6,t:0,hit:0,r:40});
      ui.stageMessage.querySelector('small').textContent='WARNING · INCOMING BOSS';
      ui.stageMessage.querySelector('strong').textContent='BOSS STAGE';
    } else {
      const cols=state.wave>=4 ? 7 : 6, rows=state.wave>=5 ? 4 : 3;
      const gap=cols===7?56:64, start=(W-(cols-1)*gap)/2;
      for(let row=0;row<rows;row++) for(let col=0;col<cols;col++) {
        const type=row===0?'gold':(row===1?'pink':'blue');
        state.enemies.push({boss:false,type,homeX:start+col*gap,homeY:177+row*55,x:start+col*gap,y:-50-row*20,hp:(type==='gold'?2:1)+((state.difficulty>=4&&type==='gold')||(state.difficulty>=5&&type==='pink')?1:0),phase:'enter',delay:(cols-1-col)*.045+row*.14,t:0,fire:rand(1.5,3.8),hit:0,r:17});
      }
      ui.stageMessage.querySelector('small').textContent='READY FOR TAKEOFF';
      ui.stageMessage.querySelector('strong').textContent='STAGE '+String(state.wave).padStart(2,'0');
    }
    show(ui.stageMessage,true); audio.sfx('wave'); syncHud();
  }
  function firePlayer() {
    const p=state.player, y=p.y-25, power=state.power;
    if(power===0) state.shots.push({x:p.x,y,vx:0,vy:-690});
    else if(power===1) { state.shots.push({x:p.x-9,y,vx:-18,vy:-690},{x:p.x+9,y,vx:18,vy:-690}); }
    else { state.shots.push({x:p.x,y,vx:0,vy:-720},{x:p.x-11,y:y+4,vx:-120,vy:-670},{x:p.x+11,y:y+4,vx:120,vy:-670}); }
    audio.sfx('shoot');
  }
  function shootAtPlayer(e, spread=0) {
    const p=state.player, angle=Math.atan2(p.y-e.y,p.x-e.x)+spread, speed=(180+Math.min(75,state.wave*9))*difficulties[state.difficulty-1].bulletSpeed;
    state.bullets.push({x:e.x,y:e.y+12,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,r:e.boss?5:4,kind:e.boss?'boss':'normal'});
  }
  function burst(x,y,color,count=10,force=1) {
    for(let i=0;i<count;i++) { const a=rand(0,Math.PI*2),v=rand(35,180)*force; state.particles.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life:rand(.25,.7),max:.7,color,r:rand(1.5,4)}); }
  }
  function addText(x,y,text,color='#ffe7a8') { state.texts.push({x,y,text,color,life:1}); }
  function killEnemy(index) {
    const e=state.enemies[index]; if(!e)return;
    const points=e.boss?2500:(e.type==='gold'?150:100); state.score+=points; state.kills++;
    burst(e.x,e.y,e.boss?'#ff90db':(e.type==='blue'?'#7eeaff':'#ffb97d'),e.boss?38:12,e.boss?1.5:1);
    addText(e.x,e.y,e.boss?'BOSS +2500':'+'+points); state.shake=e.boss?10:2; audio.sfx(e.boss?'bomb':'explode');
    if(e.boss) { state.bullets=[]; state.bombs=Math.min(3,state.bombs+1); }
    else if(state.kills%7===0) { const type=state.power<2?'P':(state.bombs<2?'B':(state.lives<3?'H':'P')); state.pickups.push({x:e.x,y:e.y,vy:75,type,t:0}); }
    state.enemies.splice(index,1); syncHud();
  }
  function hurtPlayer() {
    const p=state.player; if(!p || p.invuln>0 || state.mode!=='playing')return;
    state.lives--; state.power=Math.max(0,state.power-1); p.invuln=2.3; state.shake=12; state.flash=.24;
    burst(p.x,p.y,'#ff80bb',24,1.2); audio.sfx('hit'); syncHud();
    if(state.lives<=0) gameOver();
  }
  function useBomb() {
    if(state.mode!=='playing'||state.bombs<=0)return;
    state.bombs--; state.bullets=[]; state.shake=13; state.flash=.35; audio.sfx('bomb');
    for(let i=state.enemies.length-1;i>=0;i--) { const e=state.enemies[i]; e.hp-=e.boss?12:2; e.hit=.3; burst(e.x,e.y,'#b2f4ff',5); if(e.hp<=0)killEnemy(i); }
    addText(W/2,440,'NOVA BOMB!','#bff9ff'); syncHud();
  }
  function update(dt) {
    state.time+=dt;
    for(const s of stars) { s.y+=s.speed*dt*(state.mode==='playing'?1.5:.6); if(s.y>H+3){s.y=-3;s.x=rand(0,W);} }
    for(let i=state.particles.length-1;i>=0;i--) { const p=state.particles[i];p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=60*dt;p.life-=dt;if(p.life<=0)state.particles.splice(i,1); }
    for(let i=state.texts.length-1;i>=0;i--){const t=state.texts[i];t.y-=35*dt;t.life-=dt;if(t.life<=0)state.texts.splice(i,1);}
    state.shake=Math.max(0,state.shake-28*dt); state.flash=Math.max(0,state.flash-dt);
    if(state.mode!=='playing')return;
    const p=state.player, difficulty=difficulties[state.difficulty-1];
    if(state.keys.has('ArrowLeft')||state.keys.has('a')||state.keys.has('A')) p.targetX-=390*dt;
    if(state.keys.has('ArrowRight')||state.keys.has('d')||state.keys.has('D')) p.targetX+=390*dt;
    p.targetX=clamp(p.targetX,27,W-27); p.x+=(p.targetX-p.x)*Math.min(1,dt*15); p.invuln=Math.max(0,p.invuln-dt);
    p.fireTimer-=dt; if(p.fireTimer<=0){firePlayer();p.fireTimer=.18;}
    state.stageTime-=dt; if(state.stageTime<=0)show(ui.stageMessage,false);
    state.diveTimer-=dt;
    const activeDivers=state.enemies.filter(e=>e.phase==='dive').length;
    if(state.diveTimer<=0 && activeDivers<Math.min(3+difficulty.extraDivers,1+Math.floor(state.wave/3)+difficulty.extraDivers)) {
      const choices=state.enemies.filter(e=>e.phase==='formation');
      if(choices.length) { const e=choices[Math.floor(Math.random()*choices.length)]; e.phase='dive'; e.t=0; e.sx=e.x; e.sy=e.y; e.side=Math.random()>.5?1:-1; e.fire=.45; }
      state.diveTimer=Math.max(.75,2.35-state.wave*.12)*rand(.8,1.25)*difficulty.diveInterval;
    }
    for(const e of state.enemies) {
      e.t+=dt;e.hit=Math.max(0,e.hit-dt);
      if(e.boss) {
        e.x=W/2+Math.sin(e.t*.75)*132;e.y=e.homeY+Math.sin(e.t*1.6)*18;
        e.fire-=dt;if(e.fire<=0){for(let i=-difficulty.bossSpread;i<=difficulty.bossSpread;i++)shootAtPlayer(e,i*.16); e.fire=Math.max(.8,1.5-state.wave*.03)*difficulty.bossInterval;}
      } else if(e.phase==='enter') {
        if(e.t>e.delay) { const a=clamp((e.t-e.delay)/1.1,0,1),ease=1-Math.pow(1-a,3);e.x=e.homeX+(1-ease)*Math.sin(a*Math.PI*2)*75;e.y=-40+(e.homeY+40)*ease;if(a>=1){e.phase='formation';e.t=0;} }
      } else if(e.phase==='formation') {
        e.x=e.homeX+Math.sin(state.time*1.15)*22;e.y=e.homeY+Math.sin(state.time*2+e.homeX*.025)*6;
        e.fire-=dt;if(e.fire<=0 && state.wave>=difficulty.fromWave && Math.random()<difficulty.fireChance){shootAtPlayer(e);e.fire=rand(3,6)*difficulty.fireCooldown;} else if(e.fire<=0)e.fire=rand(1,3)*difficulty.fireCooldown;
      } else {
        const u=clamp(e.t*difficulty.diveSpeed/3.15,0,1);e.x=e.sx+e.side*90*Math.sin(u*Math.PI*2)+(p.x-e.sx)*.38*Math.sin(u*Math.PI);e.y=e.sy+(750-e.sy)*Math.sin(u*Math.PI);
        e.fire-=dt;if(e.fire<=0 && u>.18 && u<.8){shootAtPlayer(e); e.fire=1.1*difficulty.fireCooldown;}
        if(u>=1){e.phase='formation';e.t=0;e.fire=rand(1,3);}
      }
      if(p.invuln<=0 && Math.hypot(e.x-p.x,e.y-p.y)<e.r+13)hurtPlayer();
    }
    for(let i=state.shots.length-1;i>=0;i--) {
      const s=state.shots[i];s.x+=s.vx*dt;s.y+=s.vy*dt;
      if(s.y<-20||s.x<-20||s.x>W+20){state.shots.splice(i,1);continue;}
      for(let j=state.enemies.length-1;j>=0;j--) { const e=state.enemies[j];if(Math.hypot(s.x-e.x,s.y-e.y)<e.r+5){e.hp--;e.hit=.09;burst(s.x,s.y,'#fff1b3',3,.45);state.shots.splice(i,1);if(e.hp<=0)killEnemy(j);break;} }
    }
    for(let i=state.bullets.length-1;i>=0;i--) { const b=state.bullets[i];b.x+=b.vx*dt;b.y+=b.vy*dt;
      if(b.y>H+20||b.y<-20||b.x<-20||b.x>W+20){state.bullets.splice(i,1);continue;}
      if(p.invuln<=0&&Math.hypot(b.x-p.x,b.y-p.y)<b.r+10){state.bullets.splice(i,1);hurtPlayer();}
    }
    for(let i=state.pickups.length-1;i>=0;i--) {const it=state.pickups[i];it.y+=it.vy*dt;it.t+=dt;
      if(it.y>H+20){state.pickups.splice(i,1);continue;}
      if(Math.hypot(it.x-p.x,it.y-p.y)<31){ if(it.type==='P'){state.power=Math.min(2,state.power+1);addText(it.x,it.y,'POWER UP!','#ffed9e');} else if(it.type==='B'){state.bombs=Math.min(3,state.bombs+1);addText(it.x,it.y,'BOMB +1','#cffaff');}else{state.lives=Math.min(3,state.lives+1);addText(it.x,it.y,'LIFE +1','#ffbddc');} audio.sfx('pickup');burst(it.x,it.y,'#fff7c1',10);state.pickups.splice(i,1);syncHud();}
    }
    if(state.mode!=='playing')return;
    if(state.enemies.length===0){state.waveWait+=dt;if(state.waveWait>2.1)spawnWave();}
  }
  function path(points, fill, stroke, width=1) {
    ctx.beginPath(); points(ctx); if(fill){ctx.fillStyle=fill;ctx.fill();} if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();}
  }
  function background() {
    ctx.fillStyle='#070b24';ctx.fillRect(0,0,W,H);
    if(bgReady) {ctx.save();ctx.globalAlpha=.58;ctx.drawImage(bgCache,0,0);ctx.restore();}
    else {
      const neb=ctx.createRadialGradient(370,270,20,240,420,520);neb.addColorStop(0,'#353375');neb.addColorStop(.35,'#121b48');neb.addColorStop(1,'#050820');ctx.fillStyle=neb;ctx.fillRect(0,0,W,H);
      const glow=ctx.createRadialGradient(30,600,0,30,600,340);glow.addColorStop(0,'#21336566');glow.addColorStop(1,'#070b2400');ctx.fillStyle=glow;ctx.fillRect(0,0,W,H);
    }
    const shade=ctx.createLinearGradient(0,0,0,H);shade.addColorStop(0,'#050a1b55');shade.addColorStop(.55,'#05091c25');shade.addColorStop(1,'#05091cbb');ctx.fillStyle=shade;ctx.fillRect(0,0,W,H);
    for(const s of stars){ctx.globalAlpha=s.alpha;ctx.fillStyle='#d9f7ff';ctx.fillRect(s.x,s.y,s.r,s.r*(s.speed>38?2.5:1));}ctx.globalAlpha=1;
    ctx.strokeStyle='#8ad9ff12';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,620);ctx.lineTo(100,565);ctx.lineTo(175,601);ctx.stroke();
    ctx.beginPath();ctx.arc(455,340,105,1.4,4.3);ctx.stroke();
  }
  function drawPlayer(x,y,scale=1,inv=false) {
    ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);
    if(inv)ctx.globalAlpha=.4+Math.abs(Math.sin(state.time*20))*.6;
    if(characterArt.ship) {
      const flame=ctx.createLinearGradient(0,18,0,53);flame.addColorStop(0,'#fff7bf');flame.addColorStop(.35,'#ffad69');flame.addColorStop(1,'#ff72ce00');
      ctx.shadowBlur=13;ctx.shadowColor='#ffb86d';path(c=>{c.moveTo(-7,19);c.lineTo(0,48+Math.sin(state.time*24)*4);c.lineTo(7,19);c.closePath();},flame);ctx.shadowBlur=0;
      const image=characterArt.ship, width=72, height=width*image.height/image.width;
      ctx.drawImage(image,-width/2,-height/2,width,height);ctx.restore();return;
    }
    const flame=ctx.createLinearGradient(0,12,0,45);flame.addColorStop(0,'#fff8bc');flame.addColorStop(.35,'#ffb35e');flame.addColorStop(1,'#fa5cce00');
    ctx.shadowBlur=18;ctx.shadowColor='#ff9b76';path(c=>{c.moveTo(-9,13);c.lineTo(0,40+Math.sin(state.time*24)*5);c.lineTo(9,13);c.closePath();},flame);ctx.shadowBlur=0;
    // Fins and body silhouette, drawn as a small hand-inked spacecraft.
    let g=ctx.createLinearGradient(-34,0,34,17);g.addColorStop(0,'#248cc6');g.addColorStop(.45,'#c3faff');g.addColorStop(1,'#3969be');
    path(c=>{c.moveTo(-9,-8);c.lineTo(-30,4);c.lineTo(-33,19);c.lineTo(-12,14);c.lineTo(0,21);c.lineTo(12,14);c.lineTo(33,19);c.lineTo(30,4);c.lineTo(9,-8);c.closePath();},g,'#d0faff',1.2);
    path(c=>{c.moveTo(-28,7);c.lineTo(-19,4);c.lineTo(-19,13);c.lineTo(-29,16);c.closePath();},'#ff78ad');
    path(c=>{c.moveTo(28,7);c.lineTo(19,4);c.lineTo(19,13);c.lineTo(29,16);c.closePath();},'#ff78ad');
    const body=ctx.createLinearGradient(-10,-26,14,22);body.addColorStop(0,'#f9ffff');body.addColorStop(.45,'#b6efff');body.addColorStop(1,'#4b7fbf');
    path(c=>{c.moveTo(0,-31);c.bezierCurveTo(-8,-24,-12,-6,-12,10);c.lineTo(-8,19);c.lineTo(8,19);c.lineTo(12,10);c.bezierCurveTo(12,-6,8,-24,0,-31);c.closePath();},body,'#f1ffff',1);
    const cockpit=ctx.createLinearGradient(0,-18,0,9);cockpit.addColorStop(0,'#a8f8ff');cockpit.addColorStop(.4,'#3dc7f1');cockpit.addColorStop(1,'#2664a9');
    path(c=>{c.moveTo(0,-19);c.bezierCurveTo(-5,-14,-6,-5,-5,2);c.quadraticCurveTo(0,6,5,2);c.bezierCurveTo(6,-5,5,-14,0,-19);c.closePath();},cockpit,'#e3ffff',.8);
    path(c=>{c.moveTo(-5,11);c.lineTo(5,11);c.lineTo(4,17);c.lineTo(-4,17);c.closePath();},'#ffb65c');
    ctx.restore();
  }
  function drawWing(wing,rect,width,height,angle) {
    const factor=width/rect[2],x=-width/2+(wing.rect[0]-rect[0])*factor,y=-height/2+(wing.rect[1]-rect[1])*factor;
    const px=-width/2+(wing.pivot[0]-rect[0])*factor,py=-height/2+(wing.pivot[1]-rect[1])*factor;
    ctx.save();ctx.translate(px,py);ctx.rotate(angle);ctx.drawImage(wing.image,x-px,y-py,wing.rect[2]*factor,wing.rect[3]*factor);ctx.restore();
  }
  function drawBee(x,y,type='blue',scale=1,hit=false,tilt=0) {
    ctx.save();ctx.translate(x,y);ctx.rotate(tilt);ctx.scale(scale,scale);
    const sprite=characterArt.bees[type];
    if(sprite) {
      if(hit)ctx.filter='brightness(1.7) saturate(.6)';
      const width=64,height=width*sprite.body.height/sprite.body.width, flap=Math.sin(state.time*20+x*.04)*.43;
      drawWing(sprite.left,sprite.rect,width,height,flap);drawWing(sprite.right,sprite.rect,width,height,-flap);
      ctx.drawImage(sprite.body,-width/2,-height/2,width,height);ctx.restore();return;
    }
    const full=characterArt.beeFull[type];
    if(full){if(hit)ctx.filter='brightness(1.7) saturate(.6)';const width=64,height=width*full.height/full.width;ctx.drawImage(full,-width/2,-height/2,width,height);ctx.restore();return;}
    const colors={blue:['#79e6f6','#338abf','#234c86'],pink:['#ff9cdb','#d256a7','#843c86'],gold:['#fff1a6','#f4a94f','#b86555'],boss:['#ffb4e7','#c35ca9','#70398f']}[type]||['#79e6f6','#338abf','#234c86'];
    const flap=Math.sin(state.time*20+x*.04)*.43;
    ctx.shadowBlur=9;ctx.shadowColor=colors[0];
    const wing=ctx.createLinearGradient(0,-15,0,12);wing.addColorStop(0,'#e1ffffdb');wing.addColorStop(1,colors[1]+'99');
    ctx.save();ctx.translate(-9,-1);ctx.rotate(flap);ctx.translate(9,1);
    path(c=>{c.moveTo(-9,-10);c.bezierCurveTo(-32,-23,-36,-11,-25,3);c.quadraticCurveTo(-19,10,-11,6);c.closePath();},wing,'#e1fcff',1);ctx.restore();
    ctx.save();ctx.translate(9,-1);ctx.rotate(-flap);ctx.translate(-9,1);
    path(c=>{c.moveTo(9,-10);c.bezierCurveTo(32,-23,36,-11,25,3);c.quadraticCurveTo(19,10,11,6);c.closePath();},wing,'#e1fcff',1);ctx.restore();ctx.shadowBlur=0;
    path(c=>{c.moveTo(-7,-12);c.lineTo(-12,-21);c.moveTo(7,-12);c.lineTo(12,-21);},null,colors[0],1.5);
    ctx.fillStyle=colors[0];ctx.beginPath();ctx.arc(-12,-21,2.3,0,7);ctx.arc(12,-21,2.3,0,7);ctx.fill();
    const shell=ctx.createLinearGradient(-12,-13,12,16);shell.addColorStop(0,colors[0]);shell.addColorStop(.55,colors[1]);shell.addColorStop(1,colors[2]);
    path(c=>{c.moveTo(0,-17);c.bezierCurveTo(-13,-18,-16,-7,-14,4);c.quadraticCurveTo(-12,16,0,20);c.quadraticCurveTo(12,16,14,4);c.bezierCurveTo(16,-7,13,-18,0,-17);c.closePath();},hit?'#fff':shell,'#f7e8ff',1);
    path(c=>{c.moveTo(-13,-5);c.quadraticCurveTo(0,-1,13,-5);c.lineTo(13,0);c.quadraticCurveTo(0,4,-13,0);c.closePath();},colors[2]);
    path(c=>{c.moveTo(-11,5);c.quadraticCurveTo(0,9,11,5);c.lineTo(9,10);c.quadraticCurveTo(0,13,-9,10);c.closePath();},colors[2]);
    ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(-5,-10,2.2,0,7);ctx.arc(5,-10,2.2,0,7);ctx.fill();ctx.fillStyle='#2f315e';ctx.beginPath();ctx.arc(-5,-9.5,1,0,7);ctx.arc(5,-9.5,1,0,7);ctx.fill();
    path(c=>{c.moveTo(-3,16);c.lineTo(0,23);c.lineTo(3,16);c.closePath();},'#ffe7a2');
    ctx.restore();
  }
  function drawAttract() {
    ctx.save();
    const halo=ctx.createRadialGradient(W/2,390,5,W/2,390,190);halo.addColorStop(0,'#6799f526');halo.addColorStop(1,'#7392ff00');ctx.fillStyle=halo;ctx.fillRect(20,200,440,370);
    const flight=state.time*.8;
    for(let r=0;r<3;r++)for(let c=0;c<5;c++){const x=92+c*74+Math.sin(flight+r*.7)*10,y=345+r*45+Math.sin(flight*2+c*.8)*5;drawBee(x,y,r===0?'gold':r===1?'pink':'blue',.97,false,Math.sin(flight+c)*.04);}
    if(canvas.getBoundingClientRect().height>620) drawPlayer(W/2,510+Math.sin(state.time*2)*5,1.3);
    // A few glowing shots reinforce that the menu is the actual game world.
    for(let i=0;i<3;i++){const y=430-((state.time*95+i*48)%150);ctx.fillStyle='#fff3a8';ctx.shadowBlur=10;ctx.shadowColor='#ffcc6b';ctx.fillRect(W/2-2,y,4,12);ctx.shadowBlur=0;}
    ctx.restore();
  }
  function drawPickup(it) {
    ctx.save();ctx.translate(it.x,it.y);ctx.rotate(Math.sin(it.t*3)*.10);
    const can=characterArt.cans[it.type];
    if(can){const height=48,width=height*can.width/can.height;ctx.drawImage(can,-width/2,-height/2,width,height);}
    else {
      // A small capsule remains recognisable even while the artwork is loading.
      const color=it.type==='P'?'#ffbf49':it.type==='B'?'#32d8ff':'#ff78bb';
      ctx.shadowBlur=12;ctx.shadowColor=color;ctx.fillStyle=color;ctx.strokeStyle='#e8fbff';ctx.lineWidth=1.5;
      ctx.beginPath();ctx.moveTo(-9,-15);ctx.quadraticCurveTo(-9,-19,-5,-19);ctx.lineTo(5,-19);ctx.quadraticCurveTo(9,-19,9,-15);ctx.lineTo(9,15);ctx.quadraticCurveTo(9,19,5,19);ctx.lineTo(-5,19);ctx.quadraticCurveTo(-9,19,-9,15);ctx.closePath();ctx.fill();ctx.stroke();ctx.shadowBlur=0;
    }
    // Poster symbols: gold star = power, blue arrows = bomb, pink heart = life.
    ctx.fillStyle=it.type==='P'?'#fff4a6':'#f5ffff';ctx.strokeStyle=it.type==='P'?'#a76000':it.type==='B'?'#0074a4':'#a22173';ctx.lineWidth=1.25;ctx.lineJoin='round';
    ctx.beginPath();
    if(it.type==='P'){
      for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,r=i%2?3.2:7,x=Math.cos(a)*r,y=Math.sin(a)*r+1;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.closePath();ctx.stroke();ctx.fill();
    }else if(it.type==='B'){
      ctx.lineWidth=2.2;ctx.lineCap='round';ctx.strokeStyle='#eaffff';ctx.moveTo(-5,1);ctx.lineTo(0,-4);ctx.lineTo(5,1);ctx.moveTo(-5,6);ctx.lineTo(0,1);ctx.lineTo(5,6);ctx.stroke();
    }else{
      ctx.moveTo(0,7);ctx.bezierCurveTo(-2,5,-7,1,-7,-2);ctx.bezierCurveTo(-7,-7,-2,-8,0,-4);ctx.bezierCurveTo(2,-8,7,-7,7,-2);ctx.bezierCurveTo(7,1,2,5,0,7);ctx.closePath();ctx.stroke();ctx.fill();
    }
    ctx.restore();
  }
  function drawGameplay() {
    for(const e of state.enemies){
      if(e.boss){drawBee(e.x,e.y+8,'boss',1.9,e.hit>0,Math.sin(e.t)*.05);ctx.fillStyle='#071126d9';ctx.fillRect(72,143,336,9);ctx.fillStyle='#ff7ebd';ctx.fillRect(74,145,332*Math.max(0,e.hp/e.maxHp),5);ctx.strokeStyle='#ffbfd877';ctx.strokeRect(72,143,336,9);}
      else drawBee(e.x,e.y,e.type,1,e.hit>0,e.phase==='dive'?Math.sin(e.t*2)*.18:0);
    }
    for(const s of state.shots){ctx.shadowBlur=12;ctx.shadowColor='#8ceaff';ctx.fillStyle='#a1ecff';ctx.fillRect(s.x-3,s.y-10,6,17);ctx.fillStyle='#fff';ctx.fillRect(s.x-1,s.y-10,2,14);ctx.shadowBlur=0;}
    for(const b of state.bullets){ctx.shadowBlur=12;ctx.shadowColor='#ff58ba';ctx.fillStyle=b.kind==='boss'?'#ff88c9':'#ffb0d6';ctx.beginPath();ctx.arc(b.x,b.y,b.r+2,0,7);ctx.fill();ctx.fillStyle='#fff2f8';ctx.beginPath();ctx.arc(b.x,b.y,b.r*.48,0,7);ctx.fill();ctx.shadowBlur=0;}
    for(const it of state.pickups)drawPickup(it);
    if(state.player && (state.mode==='playing'||state.mode==='paused')) drawPlayer(state.player.x,state.player.y,1,state.player.invuln>0);
    for(const p of state.particles){ctx.globalAlpha=Math.min(1,p.life/p.max*1.5);ctx.fillStyle=p.color;ctx.fillRect(p.x-p.r/2,p.y-p.r/2,p.r,p.r);}ctx.globalAlpha=1;
    ctx.textAlign='center';ctx.font='900 14px system-ui';for(const t of state.texts){ctx.globalAlpha=Math.min(1,t.life*2);ctx.fillStyle=t.color;ctx.fillText(t.text,t.x,t.y);}ctx.globalAlpha=1;
  }
  function draw() {
    ctx.clearRect(0,0,W,H);ctx.save();
    if(state.shake>0)ctx.translate(rand(-state.shake,state.shake),rand(-state.shake,state.shake));
    background();
    if(state.mode==='menu')drawAttract();else drawGameplay();
    ctx.restore();
    if(state.flash>0){ctx.fillStyle=`rgba(208,239,255,${Math.min(.45,state.flash)})`;ctx.fillRect(0,0,W,H);}
  }
  function frame(now) {if(!state.last)state.last=now;const elapsed=Math.min(.5,Math.max(0,(now-state.last)/1000));state.last=now;if(elapsed>0){const steps=Math.ceil(elapsed/.025),dt=elapsed/steps;for(let i=0;i<steps;i++)update(dt);}draw();requestAnimationFrame(frame);}

  function pointerX(event) { const rect=canvas.getBoundingClientRect();return (event.clientX-rect.left)/rect.width*W; }
  canvas.addEventListener('pointerdown',e=>{if(state.mode!=='playing')return;state.pointer=true;state.player.targetX=clamp(pointerX(e),27,W-27);try{canvas.setPointerCapture(e.pointerId);}catch(_){}e.preventDefault();});
  canvas.addEventListener('pointermove',e=>{if(state.mode==='playing'&&state.pointer){state.player.targetX=clamp(pointerX(e),27,W-27);e.preventDefault();}});
  canvas.addEventListener('pointerup',()=>{state.pointer=false;}); canvas.addEventListener('pointercancel',()=>{state.pointer=false;});
  window.addEventListener('keydown',e=>{
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' ','Escape'].includes(e.key))e.preventDefault();
    if(e.repeat && ['Escape','p','P','x','X','b','B'].includes(e.key))return;
    if(state.mode==='playing'){state.keys.add(e.key);if(['x','X','b','B'].includes(e.key))useBomb();else if(['Escape','p','P'].includes(e.key))togglePause();}
    else if(state.mode==='paused'&&['Escape','p','P'].includes(e.key))togglePause();
  });
  window.addEventListener('keyup',e=>state.keys.delete(e.key));
  window.addEventListener('blur',()=>{if(state.mode==='playing')togglePause();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.mode==='playing')togglePause();});
  $('startBtn').addEventListener('click',startGame);$('restartBtn').addEventListener('click',startGame);$('resumeBtn').addEventListener('click',togglePause);$('quitBtn').addEventListener('click',goHome);$('homeBtn').addEventListener('click',goHome);
  ui.pauseBtn.addEventListener('click',togglePause);ui.bombBtn.addEventListener('click',useBomb);
  ui.soundBtn.addEventListener('click',()=>{audio.init();audio.setMuted(!audio.muted);ui.soundBtn.textContent=audio.muted?'♪̸':'♫';ui.soundBtn.setAttribute('aria-label',audio.muted?'開啟音效與音樂':'關閉音效與音樂');});
  let installPrompt = null;
  const installButton = $('installBtn');
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt=event; show(installButton,true); });
  installButton.addEventListener('click', async () => {
    if(!installPrompt) return;
    const prompt=installPrompt; installPrompt=null; show(installButton,false);
    try { await prompt.prompt(); } catch (_) { /* The browser can still offer installation in its menu. */ }
  });
  window.addEventListener('appinstalled', () => { installPrompt=null; show(installButton,false); });
  if('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(registration => registration.update().catch(()=>{})).catch(error => console.warn('Offline support could not start:',error));
    });
  }
  document.querySelectorAll('.difficulty-option').forEach(button => button.addEventListener('click',() => setDifficulty(Number(button.dataset.difficulty))));
  setMode('menu'); setDifficulty(selectedDifficulty); requestAnimationFrame(frame);
})();
