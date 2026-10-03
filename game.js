(() => {
"use strict";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d", {alpha:false});
const $ = id => document.getElementById(id);

let W=0,H=0,DPR=1;
let state="menu", last=0, elapsed=0, spawnTimer=0, crystalTimer=0;
let score=0, coins=0, kills=0, level=1, levelXP=0, levelNeed=100;
let best=Number(localStorage.getItem("basitShadowBest")||0);
let savedCoins=Number(localStorage.getItem("basitShadowCoins")||0);
let soundOn=localStorage.getItem("basitShadowSound")!=="off";
let player, enemies=[], shots=[], pickups=[], particles=[], texts=[], stars=[];
let keys={}, joystick={active:false,x:0,y:0,id:null}, attackHeld=false;
let combo=0, comboTimer=0, missionKills=0, missionCrystals=0;
let shake=0;

function resize(){
  DPR=Math.min(devicePixelRatio||1,2);
  W=innerWidth; H=innerHeight;
  canvas.width=Math.floor(W*DPR); canvas.height=Math.floor(H*DPR);
  ctx.setTransform(DPR,0,0,DPR,0,0);
  stars=Array.from({length:Math.max(35,Math.floor(W*H/13000))},()=>({
    x:Math.random()*W,y:Math.random()*H,r:Math.random()*1.6+.3,a:Math.random()*.55+.15,s:Math.random()*.45+.15
  }));
}
addEventListener("resize",resize); resize();

function resetGame(){
  state="play"; score=0; coins=0; kills=0; level=1; levelXP=0; levelNeed=100;
  elapsed=0; spawnTimer=.2; crystalTimer=3; enemies=[]; shots=[]; pickups=[]; particles=[]; texts=[];
  combo=0; comboTimer=0; missionKills=0; missionCrystals=0; shake=0;
  player={x:W/2,y:H/2,r:18,speed:235,lives:3,inv:0,shield:0,magnet:0,blast:2,attackCd:0,flash:0};
  $("hud").classList.remove("hidden"); $("controls").classList.remove("hidden");
  $("menu").classList.add("hidden"); $("how").classList.add("hidden"); $("gameOver").classList.add("hidden"); $("pauseOverlay").classList.add("hidden");
  updateHUD();
  beep(330,.06,"sine");
}

function endGame(){
  state="over"; $("hud").classList.add("hidden"); $("controls").classList.add("hidden");
  $("finalScore").textContent=Math.floor(score);
  $("finalKills").textContent=kills;
  $("finalCoins").textContent=coins;
  $("finalLevel").textContent=level;
  const isBest=score>best;
  if(isBest){best=Math.floor(score);localStorage.setItem("basitShadowBest",best);}
  savedCoins+=coins; localStorage.setItem("basitShadowCoins",savedCoins);
  $("menuBest").textContent=best; $("menuCoins").textContent=savedCoins;
  $("newBest").classList.toggle("hidden",!isBest);
  $("gameOver").classList.remove("hidden");
  beep(100,.18,"sawtooth"); setTimeout(()=>beep(70,.22,"sawtooth"),90);
}

function updateHUD(){
  $("lives").textContent=player.lives;
  $("score").textContent=Math.floor(score);
  $("coins").textContent=coins;
  $("level").textContent=level;
  $("levelBar").style.width=Math.min(100,levelXP/levelNeed*100)+"%";
  let p=[];
  if(player.shield>0)p.push("🛡 "+Math.ceil(player.shield));
  if(player.magnet>0)p.push("🧲 "+Math.ceil(player.magnet));
  $("powerText").textContent=p.join("   ");
}

function addScore(n){
  score+=n*(1+Math.min(combo,9)*.1);
  levelXP+=n;
  while(levelXP>=levelNeed){
    levelXP-=levelNeed; level++; levelNeed=Math.floor(levelNeed*1.2);
    player.lives=Math.min(3,player.lives+1);
    player.blast=Math.min(3,player.blast+1);
    burst(player.x,player.y,18,"#69e8ff");
    addText(player.x,player.y-30,"LEVEL "+level,"#6feaff",20);
    beep(740,.08,"square"); setTimeout(()=>beep(980,.08,"square"),90);
  }
}

function spawnEnemy(){
  const side=Math.floor(Math.random()*4), pad=45;
  let x,y;
  if(side===0){x=Math.random()*W;y=-pad}
  if(side===1){x=W+pad;y=Math.random()*H}
  if(side===2){x=Math.random()*W;y=H+pad}
  if(side===3){x=-pad;y=Math.random()*H}
  const roll=Math.random();
  let type="shadow";
  if(level>=3 && roll<.22)type="runner";
  if(level>=5 && roll>.78)type="tank";
  const cfg={
    shadow:{r:15,hp:1,s:72+level*3,dmg:1,color:"#8c5cff",value:35},
    runner:{r:12,hp:1,s:116+level*4,dmg:1,color:"#ff5bba",value:50},
    tank:{r:23,hp:4,s:48+level*2,dmg:1,color:"#ff6d5b",value:100}
  }[type];
  enemies.push({x,y,type,r:cfg.r,hp:cfg.hp,max:cfg.hp,s:cfg.s,dmg:cfg.dmg,color:cfg.color,value:cfg.value,hit:0,phase:Math.random()*6.28});
}

function spawnPickup(x,y,kind){
  pickups.push({x,y,kind,r:kind==="coin"?8:10,t:0});
}

function shoot(){
  if(state!=="play"||!player||player.attackCd>0)return;
  let target=null, dist=Infinity;
  for(const e of enemies){
    const d=(e.x-player.x)**2+(e.y-player.y)**2;
    if(d<dist){dist=d;target=e;}
  }
  let ang=target?Math.atan2(target.y-player.y,target.x-player.x):(joystick.x||1?Math.atan2(joystick.y,joystick.x):0);
  if(!target && Math.abs(joystick.x)+Math.abs(joystick.y)<.1)ang=0;
  shots.push({x:player.x+Math.cos(ang)*20,y:player.y+Math.sin(ang)*20,vx:Math.cos(ang)*520,vy:Math.sin(ang)*520,r:5,life:1.2});
  player.attackCd=.22; player.flash=.06;
  beep(520,.035,"triangle");
}

function blast(){
  if(state!=="play"||player.blast<=0)return;
  player.blast--; const radius=145;
  for(let i=enemies.length-1;i>=0;i--){
    const e=enemies[i], d=Math.hypot(e.x-player.x,e.y-player.y);
    if(d<radius){
      burst(e.x,e.y,10,e.color); addScore(e.value); kills++; missionKills++;
      if(Math.random()<.35)spawnPickup(e.x,e.y,"coin");
      enemies.splice(i,1);
    }
  }
  burst(player.x,player.y,45,"#ffdb63"); shake=8; beep(90,.12,"sawtooth");
}

function damage(){
  if(player.inv>0||player.shield>0)return;
  player.lives--; player.inv=1.2; combo=0; shake=12;
  burst(player.x,player.y,20,"#ff4f78"); beep(90,.12,"square");
  if(player.lives<=0)endGame();
}

function collect(p){
  if(p.kind==="coin"){coins++;addScore(15);addText(p.x,p.y,"+COIN","#ffd75b",13);beep(800,.035,"sine");}
  if(p.kind==="crystal"){missionCrystals++;addScore(30);addText(p.x,p.y,"+CRYSTAL","#67efff",12);beep(960,.04,"sine");}
  if(p.kind==="shield"){player.shield=7;addText(p.x,p.y,"SHIELD","#75aaff",14);beep(480,.08,"sine");}
  if(p.kind==="magnet"){player.magnet=8;addText(p.x,p.y,"MAGNET","#e18aff",14);beep(620,.08,"sine");}
}

function update(dt){
  if(state!=="play")return;
  elapsed+=dt; player.inv=Math.max(0,player.inv-dt); player.shield=Math.max(0,player.shield-dt);
  player.magnet=Math.max(0,player.magnet-dt); player.attackCd=Math.max(0,player.attackCd-dt); player.flash=Math.max(0,player.flash-dt);
  comboTimer=Math.max(0,comboTimer-dt); if(comboTimer<=0)combo=0;
  const joyX=joystick.x, joyY=joystick.y;
  let mx=(keys.d||keys.ArrowRight?1:0)-(keys.a||keys.ArrowLeft?1:0)+joyX;
  let my=(keys.s||keys.ArrowDown?1:0)-(keys.w||keys.ArrowUp?1:0)+joyY;
  const len=Math.hypot(mx,my); if(len>1){mx/=len;my/=len;}
  player.x+=mx*player.speed*dt; player.y+=my*player.speed*dt;
  player.x=Math.max(24,Math.min(W-24,player.x)); player.y=Math.max(55,Math.min(H-30,player.y));
  if(attackHeld||keys[" "]||keys.Enter)shoot();

  spawnTimer-=dt;
  const interval=Math.max(.24,1.05-level*.045);
  if(spawnTimer<=0){spawnTimer=interval*(.65+Math.random()*.55);spawnEnemy();if(level>=7&&Math.random()<.12)spawnEnemy();}
  crystalTimer-=dt;
  if(crystalTimer<=0){crystalTimer=5+Math.random()*4;spawnPickup(35+Math.random()*(W-70),75+Math.random()*Math.max(50,H-150),"crystal");}
  if(Math.random()<dt*.07)spawnPickup(25+Math.random()*(W-50),70+Math.random()*Math.max(40,H-130),"coin");
  if(Math.random()<dt*.012)spawnPickup(25+Math.random()*(W-50),70+Math.random()*Math.max(40,H-130),Math.random()<.5?"shield":"magnet");

  for(const e of enemies){
    const dx=player.x-e.x,dy=player.y-e.y,d=Math.hypot(dx,dy)||1;
    e.x+=dx/d*e.s*dt;e.y+=dy/d*e.s*dt;e.hit=Math.max(0,e.hit-dt);e.phase+=dt*4;
    if(d<e.r+player.r && e.hit<=0){e.hit=.65;damage();}
  }

  for(let i=shots.length-1;i>=0;i--){
    const s=shots[i];s.x+=s.vx*dt;s.y+=s.vy*dt;s.life-=dt;
    let hit=false;
    for(let j=enemies.length-1;j>=0;j--){
      const e=enemies[j];
      if(Math.hypot(s.x-e.x,s.y-e.y)<s.r+e.r){
        e.hp--;e.hit=.1;burst(s.x,s.y,5,"#7af2ff");hit=true;
        if(e.hp<=0){
          kills++;missionKills++;combo++;comboTimer=2.3;addScore(e.value);
          if(Math.random()<.25)spawnPickup(e.x,e.y,"coin");
          if(Math.random()<.08)spawnPickup(e.x,e.y,"crystal");
          burst(e.x,e.y,12,e.color);addText(e.x,e.y,"+"+e.value,"#fff",12);
          enemies.splice(j,1);beep(160+Math.random()*100,.035,"square");
        }
        break;
      }
    }
    if(hit||s.life<=0||s.x<-30||s.x>W+30||s.y<-30||s.y>H+30)shots.splice(i,1);
  }

  for(let i=pickups.length-1;i>=0;i--){
    const p=pickups[i];p.t+=dt;
    let dx=player.x-p.x,dy=player.y-p.y,d=Math.hypot(dx,dy)||1;
    if(player.magnet>0 && (p.kind==="coin"||p.kind==="crystal")){
      p.x+=dx/d*260*dt;p.y+=dy/d*260*dt;
    }
    if(d<player.r+p.r+5){collect(p);pickups.splice(i,1);}
  }

  for(let i=particles.length-1;i>=0;i--){
    const p=particles[i];p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;p.vx*=.97;p.vy*=.97;
    if(p.life<=0)particles.splice(i,1);
  }
  for(let i=texts.length-1;i>=0;i--){const t=texts[i];t.y-=24*dt;t.life-=dt;if(t.life<=0)texts.splice(i,1);}
  updateHUD();
}

function draw(){
  ctx.save();
  if(shake>0){ctx.translate((Math.random()-.5)*shake,(Math.random()-.5)*shake);shake*=.88;if(shake<.3)shake=0;}
  const g=ctx.createRadialGradient(W/2,H/2,0,W/2,H/2,Math.max(W,H)*.75);
  g.addColorStop(0,"#121a35");g.addColorStop(1,"#050711");ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  drawStars();drawGrid();
  pickups.forEach(drawPickup);shots.forEach(drawShot);enemies.forEach(drawEnemy);if(player)drawPlayer();
  particles.forEach(p=>{ctx.globalAlpha=Math.max(0,p.life/.8);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();});
  ctx.globalAlpha=1;
  texts.forEach(t=>{ctx.globalAlpha=Math.max(0,t.life);ctx.fillStyle=t.color;ctx.font=`900 ${t.size}px Arial`;ctx.textAlign="center";ctx.fillText(t.text,t.x,t.y);});
  if(state==="play"&&combo>=2){ctx.fillStyle="#ffd85e";ctx.font="900 14px Arial";ctx.textAlign="center";ctx.fillText("COMBO x"+combo,W/2,72);}
  ctx.restore();
}

function drawStars(){
  for(const s of stars){s.y+=s.s;if(s.y>H)s.y=0;ctx.globalAlpha=s.a;ctx.fillStyle="#b7d7ff";ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fill();}
  ctx.globalAlpha=1;
}
function drawGrid(){
  ctx.strokeStyle="rgba(91,120,190,.075)";ctx.lineWidth=1;
  const step=48, off=(elapsed*8)%step;
  for(let x=-step+off;x<W+step;x+=step){ctx.beginPath();ctx.moveTo(x,45);ctx.lineTo(x,H);ctx.stroke();}
  for(let y=45-off;y<H+step;y+=step){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
}
function drawPlayer(){
  if(player.inv>0&&Math.floor(player.inv*12)%2===0)return;
  if(player.shield>0){ctx.strokeStyle="rgba(80,180,255,.8)";ctx.lineWidth=3;ctx.beginPath();ctx.arc(player.x,player.y,player.r+9+Math.sin(elapsed*6)*2,0,Math.PI*2);ctx.stroke();}
  const grad=ctx.createRadialGradient(player.x-5,player.y-7,2,player.x,player.y,player.r+5);
  grad.addColorStop(0,"#d9ffff");grad.addColorStop(.35,"#63eaff");grad.addColorStop(1,"#4760ff");
  ctx.fillStyle=grad;ctx.beginPath();ctx.arc(player.x,player.y,player.r,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle="#fff";ctx.lineWidth=2;ctx.stroke();
  ctx.fillStyle="#08101e";ctx.beginPath();ctx.arc(player.x-6,player.y-3,2.5,0,Math.PI*2);ctx.arc(player.x+6,player.y-3,2.5,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle="#08101e";ctx.lineWidth=2;ctx.beginPath();ctx.arc(player.x-6,player.y+3,12,0.2,1.1);ctx.stroke();
  ctx.fillStyle="#fff";ctx.font="900 9px Arial";ctx.textAlign="center";ctx.fillText("BASIT",player.x,player.y-player.r-9);
}
function drawEnemy(e){
  ctx.save();ctx.translate(e.x,e.y);ctx.rotate(e.phase*.1);
  ctx.shadowBlur=14;ctx.shadowColor=e.color;ctx.fillStyle=e.color;
  ctx.beginPath();
  const spikes=e.type==="tank"?8:6;
  for(let i=0;i<spikes;i++){const a=i*Math.PI*2/spikes,r=i%2?e.r*.62:e.r;ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r);}
  ctx.closePath();ctx.fill();ctx.shadowBlur=0;
  ctx.fillStyle="#090b16";ctx.beginPath();ctx.arc(-e.r*.3,-2,2.5,0,Math.PI*2);ctx.arc(e.r*.3,-2,2.5,0,Math.PI*2);ctx.fill();
  if(e.max>1){ctx.fillStyle="rgba(255,255,255,.15)";ctx.fillRect(-e.r,-e.r-7,e.r*2,3);ctx.fillStyle="#ff7070";ctx.fillRect(-e.r,-e.r-7,e.r*2*(e.hp/e.max),3);}
  ctx.restore();
}
function drawShot(s){ctx.shadowBlur=14;ctx.shadowColor="#65efff";ctx.fillStyle="#d9ffff";ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;}
function drawPickup(p){
  const bob=Math.sin(p.t*5)*3;ctx.save();ctx.translate(p.x,p.y+bob);
  let c=p.kind==="coin"?"#ffd65a":p.kind==="crystal"?"#5eeaff":p.kind==="shield"?"#6da7ff":"#d887ff";
  ctx.shadowBlur=16;ctx.shadowColor=c;ctx.strokeStyle=c;ctx.fillStyle="rgba(255,255,255,.07)";ctx.lineWidth=2;
  ctx.beginPath();ctx.arc(0,0,p.r+3,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.shadowBlur=0;
  ctx.fillStyle=c;
  if(p.kind==="coin"){ctx.font="900 12px Arial";ctx.textAlign="center";ctx.fillText("$",0,4);}
  else if(p.kind==="crystal"){ctx.beginPath();ctx.moveTo(0,-8);ctx.lineTo(7,0);ctx.lineTo(0,9);ctx.lineTo(-7,0);ctx.closePath();ctx.fill();}
  else{ctx.font="16px Arial";ctx.textAlign="center";ctx.fillText(p.kind==="shield"?"🛡":"🧲",0,6);}
  ctx.restore();
}
function burst(x,y,n,color){for(let i=0;i<n;i++){const a=Math.random()*Math.PI*2,s=30+Math.random()*180;particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,r:1+Math.random()*3,life:.35+Math.random()*.55,color});}}
function addText(x,y,text,color,size){texts.push({x,y,text,color,size,life:.8});}

let audioCtx=null;
function beep(freq,dur,type){
  if(!soundOn)return;
  try{
    audioCtx=audioCtx||new (window.AudioContext||window.webkitAudioContext)();
    if(audioCtx.state==="suspended")audioCtx.resume();
    const o=audioCtx.createOscillator(),g=audioCtx.createGain();
    o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(.045,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+dur);
    o.connect(g);g.connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+dur);
  }catch(e){}
}

function setJoystick(e){
  const r=$("joystick").getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;
  let dx=e.clientX-cx,dy=e.clientY-cy,max=r.width*.36,d=Math.hypot(dx,dy)||1;
  if(d>max){dx=dx/d*max;dy=dy/d*max;}
  joystick.x=dx/max;joystick.y=dy/max;
  $("stick").style.transform=`translate(${dx}px,${dy}px)`;
}
function endJoystick(){joystick.active=false;joystick.x=0;joystick.y=0;joystick.id=null;$("stick").style.transform="translate(0,0)";}
$("joystick").addEventListener("pointerdown",e=>{joystick.active=true;joystick.id=e.pointerId;$("joystick").setPointerCapture(e.pointerId);setJoystick(e);});
$("joystick").addEventListener("pointermove",e=>{if(joystick.active&&e.pointerId===joystick.id)setJoystick(e);});
$("joystick").addEventListener("pointerup",endJoystick);$("joystick").addEventListener("pointercancel",endJoystick);
$("attackBtn").addEventListener("pointerdown",e=>{attackHeld=true;shoot();$("attackBtn").setPointerCapture(e.pointerId);});
$("attackBtn").addEventListener("pointerup",()=>attackHeld=false);$("attackBtn").addEventListener("pointercancel",()=>attackHeld=false);
$("blastBtn").addEventListener("pointerdown",blast);

addEventListener("keydown",e=>{keys[e.key]=true;if(e.key==="Escape")togglePause();});
addEventListener("keyup",e=>{keys[e.key]=false;});

function togglePause(){
  if(state==="play"){state="pause";$("pauseOverlay").classList.remove("hidden");}
  else if(state==="pause"){state="play";$("pauseOverlay").classList.add("hidden");last=performance.now();}
}
$("playBtn").onclick=resetGame;
$("againBtn").onclick=resetGame;
$("howBtn").onclick=()=>{$("menu").classList.add("hidden");$("how").classList.remove("hidden");};
$("backBtn").onclick=()=>{$("how").classList.add("hidden");$("menu").classList.remove("hidden");};
$("pauseBtn").onclick=togglePause;
$("resumeBtn").onclick=togglePause;
$("menuBtn").onclick=()=>{state="menu";$("gameOver").classList.add("hidden");$("menu").classList.remove("hidden");};
$("pauseMenuBtn").onclick=()=>{state="menu";$("pauseOverlay").classList.add("hidden");$("hud").classList.add("hidden");$("controls").classList.add("hidden");$("menu").classList.remove("hidden");};
$("soundBtn").onclick=()=>{
  soundOn=!soundOn;localStorage.setItem("basitShadowSound",soundOn?"on":"off");
  $("soundBtn").textContent=soundOn?"🔊 SOUND ON":"🔇 SOUND OFF";if(soundOn)beep(600,.06,"sine");
};
$("menuBest").textContent=best;$("menuCoins").textContent=savedCoins;
$("soundBtn").textContent=soundOn?"🔊 SOUND ON":"🔇 SOUND OFF";

function loop(now){
  const dt=Math.min(.035,(now-last)/1000||0);last=now;
  update(dt);draw();requestAnimationFrame(loop);
}
requestAnimationFrame(t=>{last=t;loop(t);});
})();
