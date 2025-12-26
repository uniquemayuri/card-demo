// 简单的俄罗斯方块实现（前端，单文件）
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next');
const nctx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const levelEl = document.getElementById('level');
const linesEl = document.getElementById('lines');
const startBtn = document.getElementById('start');
const bigStart = document.getElementById('bigStart');
const startScreen = document.getElementById('startScreen');
const pauseBtn = document.getElementById('pause');

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;
canvas.width = COLS * BLOCK;
canvas.height = ROWS * BLOCK;

// 颜色调色板（下落方块统一为四种颜色：红/绿/蓝/橙）
const COLOR_PALETTE = ['#ff4444','#22cc44','#3377ff','#ff8c33'];
// animation duration for all triggered effects (ms)
const ANIM_DURATION = 1000;
// mark flag for marked cells
const MARK_FLAG = 1000;
// mark spawn bonus accumulated by E2 effects
let markSpawnBonus = 0;
// total marked cells cleared so far (for E3 sniper milestones)
let totalMarkedCleared = 0;
// sniper state
let sniperActive = false;

// Standard tetromino matrices. Indexes: 1=I,2=O,3=T,4=J,5=L,6=S,7=Z
const SHAPES = [
  [],
  // I (4x4 to rotate around center)
  [
    [0,0,0,0],
    [1,1,1,1],
    [0,0,0,0],
    [0,0,0,0]
  ],
  // O
  [
    [2,2],
    [2,2]
  ],
  // T
  [
    [0,3,0],
    [3,3,3],
    [0,0,0]
  ],
  // J
  [
    [4,0,0],
    [4,4,4],
    [0,0,0]
  ],
  // L
  [
    [0,0,5],
    [5,5,5],
    [0,0,0]
  ],
  // S
  [
    [0,6,6],
    [6,6,0],
    [0,0,0]
  ],
  // Z
  [
    [7,7,0],
    [0,7,7],
    [0,0,0]
  ]
];

let lastGeneratedId = null; // last generated shape id
let lastGeneratedStreak = 0; // how many times the same shape appeared consecutively

function genRandomPieceId(){
  // Weighted sampling across 7 shapes, but strongly reduce probability
  // of the same shape if it has already appeared >=2 times consecutively.
  const baseWeights = new Array(7).fill(1);
  if(lastGeneratedId !== null && lastGeneratedStreak >= 2){
    // make the repeated shape much less likely (e.g. 5% of normal)
    const idx = lastGeneratedId - 1;
    baseWeights[idx] *= 0.05;
  }
  const total = baseWeights.reduce((a,b)=>a+b,0);
  let r = Math.random() * total;
  let chosen = 0;
  for(let i=0;i<7;i++){
    if(r < baseWeights[i]){ chosen = i+1; break; }
    r -= baseWeights[i];
  }
  // fallback
  if(chosen === 0) chosen = Math.floor(Math.random()*7)+1;
  // update streak tracking
  if(chosen === lastGeneratedId) lastGeneratedStreak++; else { lastGeneratedId = chosen; lastGeneratedStreak = 1; }
  return chosen;
}

function createPiece(id){
  return SHAPES[id].map(row => row.slice());
}

let nextMatrix = null;
let nextColor = 0; // 0..3 index into COLOR_PALETTE
let nextShapeId = null;

// color weight system for D-class cards
let colorWeights = [100,100,100,100]; // red, green, blue, orange

function sampleColorIndex(){
  const sum = colorWeights.reduce((a,b)=>a+b,0);
  let r = Math.random()*sum;
  for(let i=0;i<colorWeights.length;i++){
    if(r < colorWeights[i]) return i;
    r -= colorWeights[i];
  }
  return colorWeights.length-1;
}

function createMatrix(w,h){
  const m = [];
  while(h--) m.push(new Array(w).fill(0));
  return m;
}

function drawMatrix(matrix, offset, context, blockSize, overrideColorIndex){
  const c = context || ctx;
  const size = blockSize || BLOCK;
  for(let y=0;y<matrix.length;y++){
    for(let x=0;x<matrix[y].length;x++){
      const val = matrix[y][x];
      if(!val) continue;
      let color = null;
      // arena stores composite values: (colorIndex+1)*10 + shapeId
      if(val >= 10){
        const colorIndex = Math.floor(val/10) - 1;
        color = COLOR_PALETTE[colorIndex] || COLOR_PALETTE[0];
      } else {
        // matrix value is shapeId for a preview/active piece — use overrideColorIndex when provided
        if(typeof overrideColorIndex === 'number') color = COLOR_PALETTE[overrideColorIndex];
        else color = COLOR_PALETTE[0];
      }
      c.fillStyle = color;
      c.fillRect((x+offset.x)*size, (y+offset.y)*size, size-1, size-1);
    }
  }
}

function rotate(matrix, dir){
  for(let y=0;y<matrix.length;y++){
    for(let x=0;x<y;x++){
      [matrix[x][y], matrix[y][x]] = [matrix[y][x], matrix[x][y]];
    }
  }
  if(dir>0) matrix.forEach(row=>row.reverse()); else matrix.reverse();
}

const arena = createMatrix(COLS, ROWS);

function collide(arena, player){
  const [m, o] = [player.matrix, player.pos];
  for(let y=0;y<m.length;y++){
    for(let x=0;x<m[y].length;x++){
      if(!m[y][x]) continue;
      const ay = y + o.y;
      const ax = x + o.x;
      // above the arena: ignore for collision (spawn partly above)
      if(ay < 0) continue;
      if(!arena[ay] || arena[ay][ax] !== 0) return true;
    }
  }
  return false;
}

function merge(arena, player){
  // when piece lands, write shape+color to arena and possibly mark cells
  player.matrix.forEach((row,y)=>{
    row.forEach((val,x)=>{
      if(!val) return;
      const ay = y + player.pos.y;
      const ax = x + player.pos.x;
      if(ay >= 0 && arena[ay]){
        let base = (player.currentColor + 1) * 10 + player.shapeId;
        // compute total mark chance from E cards
        const eTotal = playerCards.filter(c=>/^E/.test(c)).length;
        const totalMarkChance = (eTotal * 0.05) + markSpawnBonus;
        if(Math.random() < totalMarkChance){ base += MARK_FLAG; }
        arena[ay][ax] = base;
      }
    });
  });
  // apply A4 landing bonus (if any)
  const a4bonus = Math.floor(computeA4LandingBonus());
  if(a4bonus>0){
    player.score += a4bonus;
    // animate toward score
    try{ const rect = canvas.getBoundingClientRect(); animateFloatingScore(rect.left + rect.width/2, rect.top + rect.height/2, '+'+a4bonus); }catch(e){}
    updateInfo();
  }
}

function sweep(){
  const clearedRows = [];
  const clearedRowData = [];
  let perColorRemoved = [0,0,0,0];
  outer: for(let y=arena.length-1;y>=0;y--){
    for(let x=0;x<arena[y].length;x++){
      if(arena[y][x]===0) continue outer;
    }
    // mark row for removal (do not remove yet to allow animation)
    clearedRows.push(y);
    clearedRowData.push(arena[y].slice());
  }
  const rowCount = clearedRows.length;
  if(rowCount>0){
    // show clear overlay and pause drops until animation finishes
    paused = true;
    const rect = canvas.getBoundingClientRect();
    const overlay = document.createElement('div');
    overlay.className = 'clear-overlay';
    overlay.style.left = rect.left + 'px';
    overlay.style.top = rect.top + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';
    document.body.appendChild(overlay);
    setTimeout(()=>{
      // perform actual removal from bottom to top
      // compute multiplier from A-class cards
      const multiplier = computePerLineMultiplier();
      // use Tetris-like base scoring per row count
      let basePerClear = 0;
      if(rowCount === 1) basePerClear = 100;
      else if(rowCount === 2) basePerClear = 300;
      else if(rowCount === 3) basePerClear = 500;
      else if(rowCount >= 4) basePerClear = 800;
      const base = basePerClear * player.level;
      const gain = Math.floor(base * multiplier);
      clearedRows.forEach(y=>{
        // remove row y and add empty on top
        arena.splice(y,1);
        arena.unshift(new Array(COLS).fill(0));
      });
      // animate total gain from clear
      clearedRows.forEach(yRow => { animateScoreFromRow(yRow, '+' + gain); });
      player.score += gain;
      player.lines += rowCount;
      player.level = Math.floor(player.lines/10)+1;
      // count removed blocks and color-specific counts and marked
      let removedBlocks = 0;
      let blueCount = 0;
      let markedCleared = 0;
      const orangeIsWildcard = (colorWeights[3] > Math.max(colorWeights[0], colorWeights[1], colorWeights[2]));
      clearedRowData.forEach(row => {
        row.forEach(cell => {
          if(cell !== 0){
            removedBlocks++;
            // per-color removed tally
            if(typeof perColorRemoved === 'undefined') perColorRemoved = [0,0,0,0];
            let raw = cell;
            let wasMarked = false;
            if(raw >= MARK_FLAG){ wasMarked = true; raw -= MARK_FLAG; }
            let colorIndex = 0;
            if(raw >= 10) colorIndex = Math.floor(raw/10)-1;
            if(colorIndex >=0 && colorIndex < 4) perColorRemoved[colorIndex]++;
            if(colorIndex === 2) blueCount++;
            if(orangeIsWildcard && colorIndex === 3) blueCount++;
            if(wasMarked) markedCleared++;
          }
        });
      });
      // apply task progress updates
      if(currentTask){
        if(currentTask.type === 'removeColor'){
          const added = (typeof perColorRemoved !== 'undefined' ? perColorRemoved[currentTask.color] || 0 : 0);
          currentTask.progress = (currentTask.progress || 0) + added;
        }
        if(currentTask.type === 'clearLines'){
          currentTask.progress = (currentTask.progress || 0) + rowCount;
        }
      }
      // D1: per-blue-block bonus (stacking by count of D1)
      const d1count = playerCards.filter(c=>/^D1/.test(c)).length;
      if(d1count > 0 && blueCount > 0){
        const d1gain = blueCount * 20 * d1count;
        player.score += d1gain;
        try{ animateFloatingScore(window.innerWidth/2, window.innerHeight/2, '+'+d1gain); }catch(e){}
      }
      // Iron Sword: per-cleared-block bonus
      const swordCount = playerItems['iron_sword'] || 0;
      if(swordCount > 0 && removedBlocks > 0){
        const swordGain = removedBlocks * 50 * swordCount;
        player.score += swordGain;
        try{ animateFloatingScore(window.innerWidth/2, window.innerHeight/2, '+'+swordGain); }catch(e){}
      }
      // Lucky Cat: accumulate cleared blocks and award 1 coin per 100 cleared
      if(removedBlocks > 0){
        totalClearedBlocksCounter += removedBlocks;
        while(totalClearedBlocksCounter >= 100){ totalClearedBlocksCounter -= 100; addCoins(1); }
      }
      // E-class marked cleared effects
      const eCount = playerCards.filter(c=>/^E/.test(c)).length;
      if(markedCleared > 0){
        const eScoreMultiplier = 1 + 0.5 * eCount;
        const markPoints = Math.floor(100 * eScoreMultiplier * Math.max(1, playerCards.filter(c=>/^E1/.test(c)).length));
        // if no E1, still award base 100*multiplier
        const perMarkedBase = 100 * eScoreMultiplier;
        const totalMarkGain = Math.floor(perMarkedBase * markedCleared);
        player.score += totalMarkGain;
        try{ animateFloatingScore(window.innerWidth/2, window.innerHeight/2, '+'+totalMarkGain); }catch(e){}
        // E2: increase markSpawnBonus by 1% per marked cleared per E2 card
        const e2count = playerCards.filter(c=>/^E2/.test(c)).length;
        if(e2count>0){ markSpawnBonus += 0.01 * markedCleared * e2count; }
        // track total marked cleared for E3 milestones
        totalMarkedCleared += markedCleared;
        // E3: grant sniper for each multiple of 15 marked cleared
        const e3count = playerCards.filter(c=>/^E3/.test(c)).length;
        if(e3count>0){
          while(totalMarkedCleared >= 15){ totalMarkedCleared -= 15; startSniper(); }
        }
      }
      // C-class: each cleared cell feeds the dino once
      if(hasDino && removedBlocks>0){ dinoFeed(removedBlocks); }
      // update height-based task
      if(currentTask && currentTask.type === 'reachHeight'){
        currentTask.progress = Math.max(currentTask.progress || 0, getMaxColumnHeight());
      }
      updateTaskUI();
      updateInfo();
      checkLevelProgress();
      overlay.remove();
      paused = false;
    }, ANIM_DURATION);
  }
}

function updateInfo(){
  scoreEl.textContent = player.score;
  levelEl.textContent = player.level;
  linesEl.textContent = player.lines;
  const targetEl = document.getElementById('target');
  if(targetEl) targetEl.textContent = getTargetForLevel(currentLevel);
  const coinsEl = document.getElementById('coins');
  if(coinsEl) coinsEl.textContent = playerCoins;
  const starsEl = document.getElementById('stars');
  if(starsEl) starsEl.textContent = typeof starLayers !== 'undefined' ? starLayers : 0;
  const hpEl = document.getElementById('hp');
  const maxEl = document.getElementById('maxHp');
  if(hpEl) hpEl.textContent = playerHP;
  if(maxEl) maxEl.textContent = playerMaxHP;
  const timerEl = document.getElementById('timer');
  if(timerEl) timerEl.textContent = Math.max(0, Math.ceil(levelTimeLeft));
  const shopEl = document.getElementById('shopLevel');
  if(shopEl) shopEl.textContent = shopLevel;
}

function getTargetForLevel(lv){
  if(!lv || lv < 1) lv = 1;
  if(lv <= LEVEL_TARGETS.length) return LEVEL_TARGETS[lv-1];
  return LEVEL_TARGETS[LEVEL_TARGETS.length-1];
}

function checkLevelProgress(){
  const target = getTargetForLevel(currentLevel);
  if(player.score >= target && gameStarted){
    // pause and present reward selection
    gameStarted = false;
    paused = true;
    showRewardModal();
  }
}

function showRewardModal(){
  const modal = document.getElementById('rewardModal');
  const choiceBox = document.getElementById('cardChoices');
  const nextBtn = document.getElementById('nextLevelBtn');
  if(!modal || !choiceBox || !nextBtn) return;
  // clear previous
  choiceBox.innerHTML = '';
  selectedReward = null;
  nextBtn.disabled = true;
  // generate 3 random cards
  const hopeExtra = playerItems['hope_staff'] || 0;
  const rewardCount = 3 + hopeExtra;
  const maxNum = shopLevel === 1 ? 1 : (shopLevel === 2 ? 2 : 4);
  const cards = pickCardsWithWish(rewardCount, maxNum);
  cards.forEach(id => {
    const d = document.createElement('div');
    d.className = 'card';
    d.innerHTML = `<div class="id">${id}</div><div class="desc">${getCardDescription(id)}</div>`;
    d.addEventListener('click', ()=>{
      // mark selection
      Array.from(choiceBox.children).forEach(c=>c.classList.remove('selected'));
      d.classList.add('selected');
      selectedReward = id;
      nextBtn.disabled = false;
    });
    choiceBox.appendChild(d);
  });
  // next button handler: apply card, award coins, then show inter-level UI
  // If player is cowboy, offer an extra button to skip card for +2 coins
  const extraSkip = document.createElement('button');
  extraSkip.textContent = '放弃卡牌 (+2 金币)';
  extraSkip.style.marginLeft = '8px';
  extraSkip.addEventListener('click', ()=>{
    // award coins and skip card
    addCoins(2);
    modal.style.display = 'none';
    // reset fail attempts and apply clear effects
    levelFailAttempts = 0;
    applyCharacterClearEffects();
    showInterLevelModal();
  });

  nextBtn.onclick = ()=>{
    if(!selectedReward) return;
    // apply card effect (also handles awarding 1 coin if new id)
    applyCardEffect(selectedReward);
    // award 2 coins for clearing the level (调整为更保守的经济节奏)
    addCoins(2);
    // if this level is 2,5,8 then the next task should include a card reward
    if([2,5,8].includes(currentLevel)) nextTaskIncludesCard = true;
    // reset fail attempts and record success
    levelFailAttempts = 0;
    applyCharacterClearEffects();
    // close reward modal and show inter-level options
    modal.style.display = 'none';
    showInterLevelModal();
  };

  // stop level timer while picking reward
  stopLevelTimer();
  // add cowboy skip button if applicable
  if(playerChar === 'cowboy'){
    // avoid duplicate row
    const existing = document.getElementById('cowboySkipRow');
    if(existing) existing.remove();
    const infoRow = document.createElement('div');
    infoRow.id = 'cowboySkipRow';
    infoRow.style.marginTop = '8px';
    infoRow.appendChild(extraSkip);
    modal.querySelector('.overlay-inner').appendChild(infoRow);
  }
  modal.style.display = 'flex';
}

function generateRandomCard(maxNumber){
  // Generate uniformly among allowed (type,number) pairs.
  // maxNumber: highest numeric suffix allowed (1..4). Defaults to shop-level cap.
  const maxNum = typeof maxNumber === 'number' ? Math.max(1, Math.min(4, Math.floor(maxNumber))) : (shopLevel === 1 ? 1 : (shopLevel === 2 ? 2 : 4));
  // If testMode with fixed class, force that type but pick number uniformly 1..maxNum
  if(testMode && testModeClass){
    const nums = [];
    for(let i=1;i<=maxNum;i++) nums.push(i);
    const n = nums[Math.floor(Math.random()*nums.length)];
    return testModeClass + n;
  }
  const types = ['A','B','C','D'];
  const combos = [];
  types.forEach(t=>{
    for(let i=1;i<=maxNum;i++) combos.push(t + i);
  });
  // uniform pick among combos
  const pick = combos[Math.floor(Math.random()*combos.length)];
  return pick;
}

// Helper: produce N cards ensuring wishPending is honored if possible
function pickCardsWithWish(count, maxNumber){
  const out = [];
  const maxNum = typeof maxNumber === 'number' ? Math.max(1, Math.min(4, Math.floor(maxNumber))) : (shopLevel === 1 ? 1 : (shopLevel === 2 ? 2 : 4));
  let wishUsed = false;
  if(wishPending){
    if(wishPending.kind === 'num'){
      if(wishPending.value <= maxNum){
        // force one card with this number, random type
        const types = ['A','B','C','D'];
        const t = types[Math.floor(Math.random()*types.length)];
        out.push(t + wishPending.value);
        wishUsed = true;
      }
    } else if(wishPending.kind === 'type'){
      // force one card with this type, random number within maxNum
      const n = Math.floor(Math.random()*maxNum) + 1;
      out.push(wishPending.value + n);
      wishUsed = true;
    }
  }
  while(out.length < count){ out.push(generateRandomCard(maxNum)); }
  // if wishUsed, clear pending wish (consumed)
  if(wishUsed){ wishPending = null; }
  return out;
}

// --- Task generation & UI ---
function randomInRange(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }

function generateTaskOptions(){
  // produce 3 candidate tasks
  const opts = [];
  for(let i=0;i<3;i++){
    const ttype = ['removeColor','clearLines','dropShape','reachHeight'][Math.floor(Math.random()*4)];
    let opt = { type: ttype, progress:0 };
    if(ttype === 'removeColor'){
      opt.color = Math.floor(Math.random()*4); // 0..3
      // reasonable range: 8..30
      opt.target = randomInRange(8,30);
    } else if(ttype === 'clearLines'){
      // range: 1..8
      opt.target = randomInRange(1,8);
    } else if(ttype === 'dropShape'){
      // pick shape id 1..7 and target 5..20
      opt.shape = Math.floor(Math.random()*7)+1;
      opt.target = randomInRange(5,20);
    } else if(ttype === 'reachHeight'){
      // height target 6..20
      opt.target = randomInRange(6,20);
    }
    // reward coin range depends on shopLevel
    if(shopLevel === 1) opt.coinRange = [1,3];
    else if(shopLevel === 2) opt.coinRange = [2,4];
    else opt.coinRange = [3,6];
    // if nextTaskIncludesCard, mark that this task will also yield a card
    if(nextTaskIncludesCard){ opt.includeCard = true; }
    opts.push(opt);
  }
  return opts;
}

function showTaskChoice(callback){
  const overlay = document.createElement('div'); overlay.className='overlay'; overlay.style.zIndex=110;
  const inner = document.createElement('div'); inner.className='overlay-inner';
  inner.innerHTML = '<h3>选择任务</h3><div style="margin-bottom:8px">完成任务可获得金币奖励'+(nextTaskIncludesCard? '，且本次任务包含卡牌奖励':'' )+'</div>';
  const box = document.createElement('div'); box.className='card-choices';
  const opts = generateTaskOptions();
  let sel = null;
  opts.forEach((o,idx)=>{
    const d = document.createElement('div'); d.className='card';
    let desc = '';
    if(o.type==='removeColor') desc = `消除 ${['红','绿','蓝','橙'][o.color]} 方块 ${o.target} 个`;
    if(o.type==='clearLines') desc = `完成满行消除 ${o.target} 次`;
    if(o.type==='dropShape') desc = `下落形状 ${o.shape} 的方块 ${o.target} 次`;
    if(o.type==='reachHeight') desc = `场地高度达到 ${o.target}`;
    if(o.includeCard) desc += '（含卡牌）';
    d.innerHTML = `<div class="id">任务${idx+1}</div><div class="desc">${desc}</div>`;
    d.addEventListener('click', ()=>{ Array.from(box.children).forEach(c=>c.classList.remove('selected')); d.classList.add('selected'); sel = o; });
    box.appendChild(d);
  });
  inner.appendChild(box);
  const row = document.createElement('div'); row.style.marginTop='12px';
  const ok = document.createElement('button'); ok.textContent='确定'; ok.disabled=true;
  box.addEventListener('click', ()=>{ ok.disabled = !Array.from(box.children).some(c=>c.classList.contains('selected')); });
  ok.addEventListener('click', ()=>{
    if(!sel) return;
    currentTask = Object.assign({}, sel, { progress:0 });
    nextTaskIncludesCard = false; // consumed
    overlay.remove();
    updateTaskUI();
    if(typeof callback === 'function') callback();
  });
  const cancel = document.createElement('button'); cancel.textContent='取消'; cancel.style.marginLeft='8px';
  cancel.addEventListener('click', ()=>{ overlay.remove(); if(typeof callback === 'function') callback(); });
  row.appendChild(ok); row.appendChild(cancel); inner.appendChild(row);
  overlay.appendChild(inner); document.body.appendChild(overlay);
}

function updateTaskUI(){
  const el = document.getElementById('currentTask');
  if(!el){ return; }
  if(!currentTask){ el.style.display='none'; el.innerHTML=''; return; }
  el.style.display='block';
  let text = '';
  if(currentTask.type==='removeColor') text = `任务：消除 ${['红','绿','蓝','橙'][currentTask.color]} 方块 ${currentTask.progress}/${currentTask.target}`;
  else if(currentTask.type==='clearLines') text = `任务：满行消除 ${currentTask.progress}/${currentTask.target} 次`;
  else if(currentTask.type==='dropShape') text = `任务：下落形状 ${currentTask.shape} x ${currentTask.progress}/${currentTask.target}`;
  else if(currentTask.type==='reachHeight') text = `任务：最高高度 ${currentTask.progress>=currentTask.target? currentTask.target : currentTask.progress}/${currentTask.target}`;
  if(currentTask.includeCard) text += ' （含卡牌奖励）';
  el.innerHTML = text;
}

function awardTaskReward(){
  if(!currentTask) return;
  const range = currentTask.coinRange || [1,3];
  const amount = randomInRange(range[0], range[1]);
  playerCoins += amount; updateInfo();
  try{ animateFloatingScore(window.innerWidth/2, window.innerHeight/2, '+'+amount+' 金币'); }catch(e){}
  if(currentTask.includeCard){ const cid = generateRandomCard(4); applyCardEffect(cid); try{ animateFloatingScore(window.innerWidth/2+40, window.innerHeight/2, cid); }catch(e){} }
  // clear current task
  currentTask = null; updateTaskUI(); renderOwnedList();
}

function checkTaskCompletion(){
  if(!currentTask) return;
  if(currentTask.type==='reachHeight'){
    if(currentTask.progress >= currentTask.target){ awardTaskReward(); }
  } else {
    if(currentTask.progress >= currentTask.target){ awardTaskReward(); }
  }
}

function getMaxColumnHeight(){
  let maxH = 0;
  for(let x=0;x<COLS;x++){
    let h = 0;
    for(let y=0;y<ROWS;y++){ if(arena[y][x] !== 0){ h = ROWS - y; break; } }
    if(h > maxH) maxH = h;
  }
  return maxH;
}

// Level timer helpers
function startLevelTimer(){
  // reset time and start interval
  levelTimeLeft = levelTimeLimit;
  const tick = ()=>{
    if(!gameStarted || paused) return;
    levelTimeLeft -= 0.25;
    if(levelTimeLeft <= 0){
      levelTimeLeft = 0;
      updateInfo();
      onLevelTimeUp();
    }
    updateInfo();
  };
  stopLevelTimer();
  levelTimerId = setInterval(tick, 250);
}
  function onLevelTimeUp(){
    stopLevelTimer();
    if(level11Active){
      finishLevel11();
      return;
    }
    onLevelFail('time');
  }

function finishLevel11(){
  // record current score to local leaderboard and show
  level11Active = false;
  paused = true;
  gameStarted = false;
  const sc = player.score || 0;
  saveLeaderboardEntry(sc);
  updateInfo();
  showLeaderboardModal();
}

// --- Sniper (E3) interaction ---
function startSniper(){
  if(sniperActive) return;
  sniperActive = true;
  paused = true;
  // change cursor to indicate sniper mode
  canvas.style.cursor = 'crosshair';
  // add one-time click handler
  const handler = function(e){ sniperFire(e); canvas.removeEventListener('click', handler); };
  canvas.addEventListener('click', handler);
  // visual hint
  try{ animateFloatingScore(canvas.getBoundingClientRect().left + 40, canvas.getBoundingClientRect().top + 40, 'SNIPER READY'); }catch(e){}
}

function sniperFire(e){
  if(!sniperActive) return;
  sniperActive = false;
  // compute cell coordinates
  const rect = canvas.getBoundingClientRect();
  const cx = Math.floor((e.clientX - rect.left) / BLOCK);
  const cy = Math.floor((e.clientY - rect.top) / BLOCK);
  let markedRemoved = 0;
  for(let dy=-1; dy<=1; dy++){
    for(let dx=-1; dx<=1; dx++){
      const x = cx + dx;
      const y = cy + dy;
      if(y >= 0 && y < ROWS && x >= 0 && x < COLS){
        const val = arena[y][x];
        if(val && val >= MARK_FLAG){
          markedRemoved++;
          arena[y][x] = 0;
        }
      }
    }
  }
  if(markedRemoved>0){
    const eCount = playerCards.filter(c=>/^E/.test(c)).length;
    const eScoreMultiplier = 1 + 0.5 * eCount;
    const gain = Math.floor(100 * eScoreMultiplier * markedRemoved);
    player.score += gain;
    try{ animateFloatingScore(e.clientX, e.clientY, '+'+gain); }catch(e){}
    updateInfo();
  }
  // restore state
  canvas.style.cursor = 'default';
  paused = false;
}

function loadLeaderboard(){
  try{ const raw = localStorage.getItem(LB_KEY); return raw ? JSON.parse(raw) : []; }catch(e){ return []; }
}

function saveLeaderboardEntry(score){
  const list = loadLeaderboard();
  list.push({ score: Math.floor(score), ts: Date.now() });
  list.sort((a,b)=>b.score - a.score);
  // keep top 50
  const out = list.slice(0,50);
  localStorage.setItem(LB_KEY, JSON.stringify(out));
}

function showLeaderboardModal(){
  const modal = document.getElementById('leaderboardModal');
  const box = document.getElementById('leaderboardList');
  if(!modal || !box) return;
  const list = loadLeaderboard();
  box.innerHTML = '';
  if(list.length===0) box.textContent = '暂无记录';
  list.forEach((it,idx)=>{
    const el = document.createElement('div');
    const d = new Date(it.ts);
    el.textContent = `${idx+1}. ${it.score} 分 — ${d.toLocaleString()}`;
    box.appendChild(el);
  });
  modal.style.display = 'flex';
}

function onLevelFail(reason){
  levelFailAttempts++;
  consecutiveSuccesses = 0;
  // damage mapping
  // 更温和的失败惩罚序列（首失败改为 10）
  let dmg = 50;
  if(levelFailAttempts === 1) dmg = 10;
  else if(levelFailAttempts === 2) dmg = 20;
  else if(levelFailAttempts === 3) dmg = 40;
  else dmg = 50;
  // Iron Shield reduces incoming dmg by 1 per shield owned
  const shieldCount = playerItems['iron_shield'] || 0;
  const finalDmg = Math.max(0, dmg - shieldCount);
  playerHP -= finalDmg;
  if(playerHP < 0) playerHP = 0;
  updateInfo();
  if(playerHP <= 0){
    gameOver();
    return;
  }
  // restart current level: roll back to snapshot
  player.score = levelStartSnapshot.score || player.score;
  player.lines = levelStartSnapshot.lines || player.lines;
  // clear arena and reset piece
  for(let y=0;y<arena.length;y++) arena[y].fill(0);
  starLayers = 0;
  playerReset();
  paused = false;
  gameStarted = true;
  // restart timer
  startLevelTimer();
  updateInfo();
}

function applyCharacterClearEffects(){
  consecutiveSuccesses++;
  // Superman: after 2 consecutive clears without fail, heal 30; if at max, increase maxHP and HP by 10
  if(playerChar === 'superman'){
    if(consecutiveSuccesses >= 2){
      if(playerHP < playerMaxHP){
        playerHP = Math.min(playerMaxHP, playerHP + 30);
      } else {
        playerMaxHP = Math.min(playerMaxHP + 10, 200);
        playerHP = Math.min(playerMaxHP, playerHP + 10);
      }
    }
  }
  // Cowboy: skip option handled in reward modal UI (gives +2 coins)
  // Hunter: no direct clear heal, star explosion already modified elsewhere
  updateInfo();
}

function applyCardEffect(cardId){
  // If orangeActive blocks rewards, do nothing
  if(orangeActive) return;

  // If this is a new-number card (ignoring +), award 1 coin
  const base = cardId.replace('+','');
  const alreadyHasBase = playerCards.some(c=>c.replace('+','') === base);
  if(!alreadyHasBase){ addCoins(1); }

  // Add to collected cards
  playerCards.push(cardId);
  // C-class handling
  if(cardId[0] === 'C'){
    const p = parseCard(cardId);
    if(!p) return;
    if(p.num === 1){
      // C1: first time gives dinosaur pet, repeated gives 5 feeds
      if(!hasDino){
        ensureDino();
      } else {
        dinoFeed(5);
      }
    }
    if(p.num === 2){
      // C2 passive: handled in dinoFeed checks; nothing immediate
    }
    if(p.num === 3){
      // C3 passive: handled in dinoFeed checks
    }
    if(p.num === 4){
      // C4: if no badge, add 40 feed layers upon acquisition
      ensureDino();
      if(!dinoBadge){ dinoFeed(40); }
    }
  }
  // D-class handling: modify color weights
  if(cardId[0] === 'D'){
    const p = parseCard(cardId);
    if(p){
      if(p.num === 1){ // D1 -> blue +10
        colorWeights[2] += 10;
      }
      if(p.num === 2){ // D2 -> red +10
        colorWeights[0] += 10;
      }
      if(p.num === 3){ // D3 -> green +10
        colorWeights[1] += 10;
      }
      if(p.num === 4){ // D4 -> orange +10
        colorWeights[3] += 10;
      }
    }
  }
  // If A3 present, try to upgrade pairs of identical A-cards (excluding A3 itself)
  tryUpgradeACards();
  // banana trigger check (may offer extra choice)
  checkBananaTriggers();
  // register active effect placeholder
  activeEffects.push({ id: cardId });
  renderOwnedList();
  console.log('Collected card:', cardId);
  updateInfo();
}

function parseCard(id){
  // id examples: 'A1' or 'A+1'
  const m = id.match(/^([A-Z])(?:\+)?(\d)$/);
  if(!m) return null;
  return { cat: m[1], num: parseInt(m[2],10), raw: id, upgraded: id.indexOf('+')>=0 };
}

function tryUpgradeACards(){
  // upgrade pairs of identical A-cards into A+ when A3 is owned
  const hasA3 = playerCards.some(c=>/^A3$/.test(c));
  if(!hasA3) return;
  // count plain A cards by number (exclude already upgraded A+)
  for(let num=1; num<=4; num++){
    let found = true;
    while(found){
      const idxs = [];
      playerCards.forEach((c,i)=>{ if(c===('A'+num)) idxs.push(i); });
      if(idxs.length >= 2){
        // remove two and add A+num
        // remove higher index first
        playerCards.splice(idxs[1],1);
        playerCards.splice(idxs[0],1);
        playerCards.push('A+' + num);
      } else found = false;
    }
  }
}

function checkBananaTriggers(){
  if(!playerItems['banana']) return;
  // for each category, when owning 5 or more of same category numbers (ignoring +), trigger choice once per multiple of 5
  const counts = {};
  playerCards.forEach(c=>{ const b=c.replace('+',''); const cat=b[0]; counts[cat]=(counts[cat]||0)+1; });
  Object.keys(counts).forEach(cat=>{
    const cnt = counts[cat];
    if(cnt >=5){
      // present a choice between two random numbers of that category
      const nums = [1,2,3,4];
      const a = nums.splice(Math.floor(Math.random()*nums.length),1)[0];
      const b = nums[Math.floor(Math.random()*nums.length)];
      const idA = cat + a;
      const idB = cat + b;
      // simple confirm choice UI
      const pickA = confirm(`香蕉效果触发：选择卡牌 ${idA}（确定选择左边，否则选择右边 ${idB}）`);
      const chosen = pickA ? idA : idB;
      applyCardEffect(chosen);
    }
  });
}

function getAStats(){
  // returns structure with counts and effective counts
  const stats = { plain:{}, plus:{}, totalPlain:0, totalPlus:0 };
  for(let n=1;n<=4;n++){ stats.plain[n]=0; stats.plus[n]=0; }
  playerCards.forEach(c=>{
    const p = parseCard(c);
    if(!p) return;
    if(p.cat !== 'A') return;
    if(p.upgraded) stats.plus[p.num]++;
    else stats.plain[p.num]++;
  });
  let effectiveAcount = 0;
  for(let n=1;n<=4;n++){
    stats.totalPlain += stats.plain[n];
    stats.totalPlus += stats.plus[n];
    effectiveAcount += stats.plain[n] + stats.plus[n]*2;
  }
  stats.effectiveAcount = effectiveAcount;
  return stats;
}

function computePerLineMultiplier(){
  // 乘法堆叠的百分比加成逻辑（每张卡各自乘以其倍率）
  // 例如：三张 A1 -> score * (1+rate) * (1+rate) * (1+rate)
  const stats = getAStats();
  let mult = 1;
  // A1: 每张 A1 乘以 (1 + rate)，A+1 被视为 rate 放大 5 倍
  const a1_rate = 0.08;
  if(stats.plain[1] > 0) mult *= Math.pow(1 + a1_rate, stats.plain[1]);
  if(stats.plus[1] > 0) mult *= Math.pow(1 + a1_rate * 5, stats.plus[1]);
  // A2: 每张 A2 对当前 A 类持有数生效，按乘法堆叠
  const a2_base = 0.03;
  const eff = Math.max(0, stats.effectiveAcount);
  if(stats.plain[2] > 0) mult *= Math.pow(1 + a2_base * eff, stats.plain[2]);
  if(stats.plus[2] > 0) mult *= Math.pow(1 + a2_base * eff * 5, stats.plus[2]);
  return mult;
}

// If watermelon is active and chosen category present, double effects of that category
function applyWatermelonMultiplierForCard(cat){
  return (watermelonChosenCategory && cat === watermelonChosenCategory) ? 2 : 1;
}

function computeA4LandingBonus(){
  // A4: each A4 grants one-line base score per drop (upgraded multiplies by 5)
  const stats = getAStats();
  const a4_plain = stats.plain[4] || 0;
  const a4_plus = stats.plus[4] || 0;
  const multiplier = (a4_plain*1 + a4_plus*5);
  if(multiplier === 0) return 0;
  const basePerLine = 100 * player.level;
  // each owned A-class card increases this effect by 15% (per A-class card)
  const amplify = 1 + (0.15 * stats.effectiveAcount);
  return basePerLine * multiplier * amplify;
}

function addCoins(n){
  playerCoins += n;
  // Valuable earring: on coin gain heal 1 HP per earring owned
  const earringCount = playerItems['valuable_earring'] || 0;
  if(earringCount>0){ playerHP = Math.min(playerMaxHP, (playerHP||0) + earringCount); }
  updateInfo();
}

// B-class (星层) state and helpers
let starLayers = 0;
let starExplosionInProgress = false;

function getBStats(){
  const stats = { plain:{}, total:0 };
  for(let n=1;n<=4;n++) stats.plain[n]=0;
  playerCards.forEach(c=>{
    const p = parseCard(c);
    if(!p) return;
    if(p.cat !== 'B') return;
    stats.plain[p.num]++;
    stats.total++;
  });
  return stats;
}

function computeStarThreshold(){
  const bstats = getBStats();
  const b3 = bstats.plain[3] || 0;
  // slight increase to base threshold for smoother accumulation
  return Math.max(3, 12 - b3);
}

function computeStarPointMultiplier(){
  const bstats = getBStats();
  const b2 = bstats.plain[2] || 0;
  // softer multiplicative growth
  return Math.pow(1.25, b2);
}

function triggerStarExplosion(){
  if(starExplosionInProgress) return;
  starExplosionInProgress = true;
  paused = true;
  // simple visual: highlight bottom three rows then clear after timeout
  try{
    // flash effect by drawing a translucent overlay for a short duration
    const overlay = document.createElement('div');
    overlay.className = 'star-explosion-overlay';
    document.body.appendChild(overlay);
    setTimeout(()=>{
      // count how many blocks will be removed in bottom 3 rows
      let removed = 0;
      for(let r=0;r<3;r++){
        const y = arena.length-1 - r;
        for(let x=0;x<arena[y].length;x++){
          if(arena[y][x] !== 0) removed++;
          arena[y][x] = 0;
        }
      }
      // award points: 每个被清除的方块给予温和分数
      const gain = removed * 300;
      if(gain>0){ player.score += gain; animateFloatingScore(window.innerWidth/2, window.innerHeight/2, '+'+gain); }
      // remove overlay and resume
      overlay.remove();
      // 消耗较小量的星层
      starLayers = Math.max(0, starLayers - 40);
      starExplosionInProgress = false;
      paused = false;
      updateInfo();
    }, ANIM_DURATION);
  }catch(e){
    starExplosionInProgress = false;
    paused = false;
  }
}

function renderOwnedList(){
  const ownedModal = document.getElementById('ownedModal');
  const ownedList = document.getElementById('ownedList');
  if(!ownedList) return;
  ownedList.innerHTML = '';
  playerCards.forEach((cid, idx)=>{
    const card = document.createElement('div');
    card.className = 'card';
    const desc = document.createElement('div');
    desc.className = 'desc';
    desc.textContent = getCardDescription(cid);
    card.innerHTML = `<div class="id">${cid}</div>`;
    const actions = document.createElement('div');
    actions.className = 'actions';
    const sell = document.createElement('button');
    sell.textContent = '出售 +1金币';
    sell.addEventListener('click', ()=>{
      // remove this card and give 1 coin
      playerCards.splice(idx,1);
      addCoins(1);
      renderOwnedList();
      updateInfo();
    });
    actions.appendChild(sell);
    card.appendChild(desc);
    card.appendChild(actions);
    ownedList.appendChild(card);
  });
}

function getCardDescription(cid){
  const p = parseCard(cid);
  if(!p) return '';
  if(p.cat === 'A'){
    if(p.num === 1){
      const mult = p.upgraded ? 5 : 1;
      return `每次消除一行额外 +${(0.10*100*mult).toFixed(0)}% 的基础行分（A1基础10%）`.replace('%','%');
    }
    if(p.num === 2){
      const mult = p.upgraded ? 5 : 1;
      return `每拥有一张A类牌，每次消除一行额外 +${(0.05*100*mult).toFixed(0)}%（A2基础5%）`.replace('%','%');
    }
    if(p.num === 3){
      return `解锁A类牌升级机制：当拥有两张相同的A类牌时，可升级为A+。A+牌效果为对应牌号效果的5倍。`;
    }
    if(p.num === 4){
      return `每个方块着陆时获得一次基线一行分（100*等级）作为奖励；每拥有一张A类牌，提升此效果30%。`;
    }
  }
  if(p.cat === 'B'){
    if(p.num === 1) return '每次方块着陆增加 1 层星星；凑够阈值获得 1000 分（阈值默认10）。';
    if(p.num === 2) return '使星星层带来的得分效果增加 50%（可叠加，乘法叠加）。';
    if(p.num === 3) return '每张 B3 将星星触发阈值减少 1。';
    if(p.num === 4) return '当星层达到50触发星星爆炸：清除底部三层，按被清除方块数每个奖励1000分（含动画）。';
  }
  if(p.cat === 'D'){
    if(p.num === 1) return 'D1: 蓝色出现概率+10%，每次消除时每个蓝色方块额外 +20 分（可叠加）。';
    if(p.num === 2) return 'D2: 红色出现概率+10%，每次方块下落完成若为红色，额外 +100 分（可叠加）。';
    if(p.num === 3) return 'D3: 绿色出现概率+10%，下落方块连续为绿色（从第2次开始）每次 +50 分（可叠加）。';
    if(p.num === 4) return 'D4: 橙色出现概率+10%，若橙色概率为最大，则橙色在触发得分效果时可视为其他颜色以触发 D1/D2/D3 的得分（仅用于触发得分，不影响概率替代）。';
  }
  return '暂无描述';
}

// bind view owned buttons (auto-pause when viewing)
const viewBtn = document.getElementById('viewCards');
const ownedModalClose = document.getElementById('closeOwned');
let savedPausedOnView = null;
if(viewBtn){
  viewBtn.addEventListener('click', ()=>{
    // save current pause state
    savedPausedOnView = paused;
    paused = true;
    pauseBtn.textContent = '继续';
    renderOwnedList();
    document.getElementById('ownedModal').style.display = 'flex';
  });
}
if(ownedModalClose){
  ownedModalClose.addEventListener('click', ()=>{
    document.getElementById('ownedModal').style.display = 'none';
    // restore previous pause state
    paused = savedPausedOnView === null ? false : savedPausedOnView;
    pauseBtn.textContent = paused ? '继续' : '暂停';
    savedPausedOnView = null;
  });
}

// Inter-level and shop UI bindings
const interModal = document.getElementById('interLevelModal');
const btnEnterShop = document.getElementById('btnEnterShop');
const btnNextLevel = document.getElementById('btnNextLevel');
const btnViewOwned2 = document.getElementById('btnViewOwned2');
const shopModal = document.getElementById('shopModal');
const shopItemsBox = document.getElementById('shopItems');
const closeShopBtn = document.getElementById('closeShop');

function showInterLevelModal(){
  if(!interModal) return;
  document.getElementById('modalCoins').textContent = playerCoins;
  interModal.style.display = 'flex';
}

if(btnEnterShop){
  btnEnterShop.addEventListener('click', ()=>{
    // free entry to shop; open UI
    openShop();
  });
}
if(btnNextLevel){
  btnNextLevel.addEventListener('click', ()=>{
    interModal.style.display = 'none';
    // prepare next level state but delay actual start until task chosen
    if(currentLevel < TOTAL_LEVELS){
      currentLevel++;
      for(let y=0;y<arena.length;y++) arena[y].fill(0);
      player.score = 0;
      levelStartSnapshot.score = player.score;
      // present task selection, then start
      showTaskChoice(()=>{
        playerReset();
        starLayers = 0;
        gameStarted = true;
        paused = false;
        updateInfo();
        if(testMode && currentLevel === 11){ level11Active = true; startLevelTimer(); }
      });
    } else {
      if(testMode && !level11Active){
        currentLevel = 11;
        level11Active = true;
        for(let y=0;y<arena.length;y++) arena[y].fill(0);
        player.score = 0;
        levelStartSnapshot.score = player.score;
        showTaskChoice(()=>{
          playerReset();
          starLayers = 0;
          gameStarted = true; paused = false; updateInfo();
          startLevelTimer();
        });
      } else {
        alert('已完成全部关卡');
      }
    }
  });
}
if(btnViewOwned2){ btnViewOwned2.addEventListener('click', ()=>{ renderOwnedList(); document.getElementById('ownedModal').style.display = 'flex'; }); }

function openShop(){
  if(!shopModal || !shopItemsBox) return;
  shopItemsBox.innerHTML = '';
  // mark this shop entry as allowing one wish operation
  shopModal._wishUsedThisEntry = false;
  shopModal._rerollsUsed = 0;
  shopModal._rerollsAllowed = 1 + (playerItems['shop_card'] || 0);
  // wish button
  const wishBtn = document.createElement('button'); wishBtn.textContent = '许愿 (3 金币)';
  wishBtn.style.display = 'block'; wishBtn.style.marginBottom = '8px';
  wishBtn.addEventListener('click', ()=>{
    if(shopModal._wishUsedThisEntry){ alert('本次进入商店的许愿已使用'); return; }
    if(playerCoins < 3){ alert('金币不足，许愿需 3 金币'); return; }
    // open small wish chooser
    const chooser = document.createElement('div'); chooser.style.display='flex'; chooser.style.gap='6px'; chooser.style.flexWrap='wrap'; chooser.style.marginBottom='8px';
    const info = document.createElement('div'); info.style.width='100%'; info.textContent = '选择一个卡牌类别或编号（编号受商店等级限制）'; shopItemsBox.appendChild(info);
    const types = ['A','B','C','D'];
    types.forEach(t=>{
      const b = document.createElement('button'); b.textContent = t; b.addEventListener('click', ()=>{
        if(!spendCoins(3)){ alert('金币不足，许愿需 3 金币'); return; }
        wishPending = { kind:'type', value: t }; shopModal._wishUsedThisEntry = true; alert('已许愿 类别 ' + t + '，将在下一次商店/过关奖励中出现'); openShop();
      }); chooser.appendChild(b);
    });
    // numbers
    const maxNum = shopLevel === 1 ? 1 : (shopLevel === 2 ? 2 : 4);
    for(let i=1;i<=4;i++){
      const b = document.createElement('button'); b.textContent = String(i);
      if(i>maxNum) { b.disabled = true; b.title = '当前商店等级不允许该编号出现'; }
      b.addEventListener('click', ()=>{
        if(i>maxNum){ alert('当前商店等级下不可许愿该编号'); return; }
        if(!spendCoins(3)){ alert('金币不足，许愿需 3 金币'); return; }
        wishPending = { kind:'num', value: i }; shopModal._wishUsedThisEntry = true; alert('已许愿 编号 ' + i + '，将在下一次商店/过关奖励中出现'); openShop();
      }); chooser.appendChild(b);
    }
    shopItemsBox.appendChild(chooser);
  });
  shopItemsBox.appendChild(wishBtn);
  // render according to shopLevel
  if(shopLevel === 1){
    const el = document.createElement('div'); el.className='card';
    el.innerHTML = `<div class="id">商店（等级 1）</div><div class="desc">当前无商品，仅提供升级选项</div>`;
    const up = document.createElement('button'); up.textContent = '升级商店到 2级 (5 金币)';
    up.addEventListener('click', ()=>{
      if(!spendCoins(5)){ alert('金币不足，升级需 5 金币'); return; }
      shopLevel = 2; openShop();
    });
    el.appendChild(up); shopItemsBox.appendChild(el);
  } else if(shopLevel === 2){
    // show one card (numbers 1-2), price 3; honor wish
    const cards = pickCardsWithWish(1,2);
    const cid = cards[0];
    const el = document.createElement('div'); el.className='card';
    el.innerHTML = `<div class="id">${cid}</div><div class="desc">卡牌 价格: 3 金币</div>`;
    const buy = document.createElement('button'); buy.textContent='购买卡牌 (3)';
    buy.addEventListener('click', ()=>{ if(!spendCoins(3)){ alert('金币不足'); return; } applyCardEffect(cid); renderOwnedList(); openShop(); });
    el.appendChild(buy);
    // upgrade option to level 3
    const up = document.createElement('button'); up.textContent = '升级商店到 3级 (10 金币)'; up.style.marginLeft='8px';
    up.addEventListener('click', ()=>{ if(!spendCoins(10)){ alert('金币不足，升级需 10 金币'); return; } shopLevel = 3; openShop(); });
    el.appendChild(up);
    shopItemsBox.appendChild(el);
  } else {
    // shopLevel >=3: show two cards (full range) + one item, reroll option
    const cards = pickCardsWithWish(2,4);
    for(let i=0;i<cards.length;i++){
      const cid = cards[i];
      const el = document.createElement('div'); el.className='card';
      el.innerHTML = `<div class="id">${cid}</div><div class="desc">卡牌 价格: 3 金币</div>`;
      const buy = document.createElement('button'); buy.textContent='购买卡牌 (3)';
      buy.addEventListener('click', ()=>{ if(!spendCoins(3)){ alert('金币不足'); return; } applyCardEffect(cid); renderOwnedList(); openShop(); });
      el.appendChild(buy);
      shopItemsBox.appendChild(el);
    }
    // one item
    const items = generateShopItems();
    if(items.length>0){
      const it = items[0];
      const el = document.createElement('div'); el.className='card';
      el.innerHTML = `<div class="id">${it.name}</div><div class="desc">道具 价格: ${it.price} 金币</div>`;
      const buy = document.createElement('button'); buy.textContent='购买道具';
      buy.addEventListener('click', ()=>{ if(!spendCoins(it.price)){ alert('金币不足'); return; } addItem(it.id); renderOwnedList(); openShop(); });
      el.appendChild(buy); shopItemsBox.appendChild(el);
    }
    // reroll option: 1 coin once
    const rer = document.createElement('button'); rer.textContent='刷新一次商品 (1 金币)'; rer.style.marginTop='8px';
    rer.addEventListener('click', ()=>{ if(shopModal._rerollsUsed >= shopModal._rerollsAllowed){ alert('本次进入商店刷新次数已用尽'); return; } if(!spendCoins(1)){ alert('金币不足'); return; } shopModal._rerollsUsed++; openShop(); });
    const wrap = document.createElement('div'); wrap.style.marginTop='8px'; wrap.appendChild(rer); shopItemsBox.appendChild(wrap);
  }
  shopModal.style.display = 'flex';
}

closeShopBtn && closeShopBtn.addEventListener('click', ()=>{ shopModal.style.display = 'none'; });

function generateShopItems(){
  const defs = [
    { id:'iron_sword', name:'铁剑', price:3 },
    { id:'iron_shield', name:'铁盾', price:3 },
    { id:'gem_pendant', name:'宝石挂坠', price:3 },
    { id:'valuable_earring', name:'贵重耳环', price:3 },
    { id:'horror_mask', name:'恐怖面具', price:3 },
    { id:'rare_cloak', name:'稀有斗篷', price:3 },
    { id:'shop_card', name:'商店会员卡', price:3 },
    { id:'golden_chalice', name:'黄金酒杯', price:3 },
    { id:'hope_staff', name:'希望法杖', price:3 },
    { id:'lucky_cat', name:'招财猫', price:3 },
    { id:'hourglass', name:'回转沙漏', price:3 }
  ];
  // pick 2 random items
  const out = [];
  const pool = defs.slice();
  for(let i=0;i<2;i++){ const idx = Math.floor(Math.random()*pool.length); out.push(pool.splice(idx,1)[0]); }
  return out;
}

function addItem(id){
  playerItems[id] = (playerItems[id]||0) + 1;
  // apply immediate effects
  applyItem(id);
}

function applyItem(id){
  // register item count
  playerItems[id] = (playerItems[id] || 0) + 1;
  // immediate or passive effects
  if(id === 'iron_sword'){
    // passive: handled at clear time
  }
  if(id === 'iron_shield'){
    // passive: handled in onLevelFail damage calc
  }
  if(id === 'gem_pendant'){
    playerMaxHP = (playerMaxHP || 100) + 20;
    playerHP = Math.min(playerMaxHP, (playerHP || playerMaxHP) + 20);
    updateInfo();
  }
  if(id === 'valuable_earring'){
    // passive: handled in addCoins (heal 1 per coin gain)
  }
  if(id === 'horror_mask'){
    playerMaxHP = Math.max(10, (playerMaxHP || 100) - 20);
    playerHP = Math.min(playerHP, playerMaxHP);
    addCoins(5);
    updateInfo();
  }
  if(id === 'rare_cloak'){
    // passive: award extra coin on task completion
  }
  if(id === 'shop_card'){
    // passive: handled in openShop reroll allowances
  }
  if(id === 'golden_chalice'){
    // passive: handled in spendCoins refund
  }
  if(id === 'hope_staff'){
    // passive: handled in reward modal (extra choice)
  }
  if(id === 'lucky_cat'){
    // passive: handled in sweep by totalClearedBlocksCounter
  }
  if(id === 'hourglass'){
    levelTimeLimit = (levelTimeLimit || 90) + 15;
    levelTimeLeft = levelTimeLimit;
    updateInfo();
  }
}

function playerDrop(){
  player.pos.y++;
  if(collide(arena, player)){
    player.pos.y--;
    merge(arena, player);
    // --- B-class: star layers increase on landing (before normal clears) ---
    const bstats = getBStats();
    const b1 = bstats.plain[1] || 0;
    if(b1>0){
      starLayers += b1;
      // immediate award for each reached threshold
      const threshold = computeStarThreshold();
      const mult = computeStarPointMultiplier();
      while(starLayers >= threshold){
        starLayers -= threshold;
        // 更温和的星层奖励：每次触发按 200 * multiplier 给予分数
        const award = Math.floor(200 * mult);
        player.score += award;
        try{ const rect = canvas.getBoundingClientRect(); animateFloatingScore(rect.left + rect.width/2, rect.top + rect.height/2, '+'+award); }catch(e){}
      }
      updateInfo();
    }
    // --- D-class: landing/color-based immediate effects (before resetting piece)
    const landedColor = player.currentColor; // 0:red,1:green,2:blue,3:orange
    const d2count = playerCards.filter(c=>/^D2/.test(c)).length;
    const d3count = playerCards.filter(c=>/^D3/.test(c)).length;
    const d1count = playerCards.filter(c=>/^D1/.test(c)).length;
    const d4count = playerCards.filter(c=>/^D4/.test(c)).length;
    const orangeIsWildcard = (colorWeights[3] > Math.max(colorWeights[0], colorWeights[1], colorWeights[2]));
    // Task: drop shape counting
    if(currentTask && currentTask.type === 'dropShape'){
      if(player.shapeId === currentTask.shape){ currentTask.progress = (currentTask.progress||0) + 1; }
    }
    // Task: immediate height update after landing
    if(currentTask && currentTask.type === 'reachHeight'){
      currentTask.progress = Math.max(currentTask.progress||0, getMaxColumnHeight());
    }
    updateTaskUI(); checkTaskCompletion();
    // D2: if landed red (or orange-as-red when wildcard), award 100 per D2
    if(d2count>0){
      if(landedColor === 0 || (landedColor === 3 && orangeIsWildcard)){
        player.score += 100 * d2count;
        try{ animateFloatingScore(window.innerWidth/2, window.innerHeight/2, '+'+(100*d2count)); }catch(e){}
      }
    }
    // D3: consecutive green landings (from second consecutive) award 50 per D3
    if(landedColor === 1 || (landedColor === 3 && orangeIsWildcard)){
      if(lastDropColor === landedColor) dropConsecCount++; else dropConsecCount = 1;
      lastDropColor = landedColor;
      if(dropConsecCount >= 2 && d3count>0){
        player.score += 50 * d3count;
        try{ animateFloatingScore(window.innerWidth/2, window.innerHeight/2, '+'+(50*d3count)); }catch(e){}
      }
    } else {
      lastDropColor = landedColor;
      dropConsecCount = 1;
    }
    playerReset();
    sweep();
    // after normal clears, check for star explosion (B4)
    const b4count = getBStats().plain[4] || 0;
    if(b4count>0){
      const explosionThreshold = (playerChar === 'hunter') ? 35 : 45;
      if(starLayers >= explosionThreshold){
        triggerStarExplosion();
        if(playerChar === 'hunter') addCoins(1);
      }
    }
    // dinosaur warrior eating check (based on landings)
    handleDinoLandingEat();
    if(collide(arena, player)){
      gameOver();
    }
  }
  dropCounter = 0;
}

function playerMove(dir){
  player.pos.x += dir;
  if(collide(arena, player)) player.pos.x -= dir;
}

function playerRotate(dir){
  const pos = player.pos.x;
  rotate(player.matrix, dir);
  let offset = 1;
  while(collide(arena, player)){
    player.pos.x += offset;
    offset = -(offset + (offset>0?1:-1));
    if(offset>player.matrix[0].length){
      rotate(player.matrix, -dir);
      player.pos.x = pos;
      return;
    }
  }
}

function playerReset(){
  // If nextMatrix exists, use it as the active piece; otherwise pick one.
  if(nextMatrix){
    player.matrix = nextMatrix.map(r=>r.slice());
    player.shapeId = nextShapeId;
    player.currentColor = nextColor;
  } else {
    const id = genRandomPieceId();
    player.matrix = createPiece(id);
    player.shapeId = id;
    player.currentColor = sampleColorIndex();
  }
  // generate new next piece
  const nid = genRandomPieceId();
  nextShapeId = nid;
  nextMatrix = createPiece(nid);
  nextColor = sampleColorIndex();
  // spawn slightly above the visible area for taller pieces like I
  player.pos.y = -1;
  player.pos.x = Math.floor((COLS - player.matrix[0].length)/2);
  // start level snapshot/timer when a new piece is spawned at level start
  if(!levelTimerId){
    startLevelTimer();
    // snapshot score/lines for restart on fail
    levelStartSnapshot.score = player.score;
    levelStartSnapshot.lines = player.lines;
  }
}

function draw(){
  ctx.fillStyle = '#08101b';
  ctx.fillRect(0,0,canvas.width,canvas.height);
  drawMatrix(arena, {x:0,y:0});
  drawMatrix(player.matrix, player.pos, ctx, BLOCK, player.currentColor);
}

function drawNext(){
  nctx.fillStyle = '#08101b';
  nctx.fillRect(0,0,nextCanvas.width,nextCanvas.height);
  if(!nextMatrix) return;
  // compute size to fit
  const cols = nextMatrix[0].length;
  const rows = nextMatrix.length;
  const size = Math.floor(Math.min(nextCanvas.width / cols, nextCanvas.height / rows));
  const off = { x: Math.floor((nextCanvas.width/size - cols)/2), y: Math.floor((nextCanvas.height/size - rows)/2) };
  drawMatrix(nextMatrix, off, nctx, size, nextColor);
}

let dropCounter = 0;
let dropInterval = 1000;
let lastTime = 0;
let paused = false;
let gameStarted = false;
let dropTimeByLevel = lvl => Math.max(1000 - (lvl-1)*80, 120);
// Level & reward card framework
const TOTAL_LEVELS = 10;
let currentLevel = 1;
let levelBaseTarget = 300; // target multiplier per level (can be adjusted)
let selectedReward = null;
let playerCards = []; // collected cards
let activeEffects = []; // effects applied to upcoming levels
// coins & items
let playerCoins = 0;
let playerItems = {}; // map id -> count
let grapeUnlocked = false; // allows buying cards in shop
let watermelonChosenCategory = null; // if watermelon used
let orangeActive = false; // orange clears cards/items and enables combo mode
let comboCount = 0;
let comboRemainingDrops = 0;
// Shop level: 1 (no cards/items), 2 (cards 1-2), 3 (full)
let shopLevel = 1;
// Wish pool: when player pays 3 coins in a shop visit, they set a wish
// wishPending = { kind: 'type'|'num', value: 'A'|'B'|'C'|'D' or 1..4 }
let wishPending = null;
// total cleared blocks (for Lucky Cat)
let totalClearedBlocksCounter = 0;

function spendCoins(n){
  if(playerCoins < n) return false;
  playerCoins -= n;
  // Golden Chalice effect: for each owned chalice, refund floor(n/5) coins
  const chaliceCount = playerItems['golden_chalice'] || 0;
  if(chaliceCount>0){
    const refund = Math.floor(n/5) * chaliceCount;
    if(refund>0) addCoins(refund);
  }
  updateInfo();
  return true;
}
// Task system
let currentTask = null; // {type:'removeColor'|'clearLines'|'dropShape'|'reachHeight', param:..., target:, progress:, rewardCard:boolean}
let nextTaskIncludesCard = false; // set when passing levels 2,5,8
// Dinosaur (C-class) state
let hasDino = false;
let dinoFeedCount = 0; // total feeds
let dinoStage = 0; // 0: baby,1:warrior,2:legend
let dinoLandingCount = 0; // piece landings counter for warrior effect
let dinoBadge = false;
let dinoLastC2Milestone = 0;
let dinoLastC3Milestone = 0;

// drop color consecutive tracking for D3
let lastDropColor = null;
let dropConsecCount = 0;
// Test mode / leaderboard
let testMode = false;
let testModeClass = null; // 'A'|'B'|'C'|'D'
let level11Active = false;
const LB_KEY = 'tetris_lb_v1';

function cClassCount(){
  return playerCards.filter(c=>c[0]==='C').length;
}

function showDinoOverlay(mode, text, duration=ANIM_DURATION){
  const el = document.getElementById('dinoOverlay');
  const img = document.getElementById('dinoImg');
  const txt = document.getElementById('dinoText');
  if(!el || !img || !txt) return;
  txt.textContent = text || '';
  el.style.display = 'block';
  el.classList.remove('feed','evolve','eat','badge');
  el.classList.add(mode);
  // if this is an animation that should block (e.g., evolve/eat/badge), pause drops
  const shouldBlock = (mode === 'evolve' || mode === 'eat' || mode === 'badge');
  if(shouldBlock) paused = true;
  // remove the animation class after duration but keep overlay visible
  setTimeout(()=>{
    el.classList.remove(mode);
    if(shouldBlock) paused = false;
  }, duration);
}

function updateDinoDisplay(){
  const el = document.getElementById('dinoOverlay');
  const img = document.getElementById('dinoImg');
  const txt = document.getElementById('dinoText');
  if(!el || !img || !txt) return;
  // clear existing stage classes
  el.classList.remove('stage-baby','stage-warrior','stage-legend');
  if(dinoStage === 0){
    el.classList.add('stage-baby'); img.textContent = '🦖'; txt.textContent = '恐龙宝贝';
  } else if(dinoStage === 1){
    el.classList.add('stage-warrior'); img.textContent = '⚔️🦖'; txt.textContent = '恐龙战士';
  } else if(dinoStage === 2){
    el.classList.add('stage-legend'); img.textContent = '🐲'; txt.textContent = '传奇恐龙';
  }
  // badge marker
  if(dinoBadge){ el.classList.add('badge'); }
}

function ensureDino(){
  if(!hasDino){
    hasDino = true; dinoFeedCount = 0; dinoStage = 0; dinoLandingCount = 0; dinoBadge = false; dinoLastC2Milestone = 0; dinoLastC3Milestone = 0;
    // ensure persistent dino panel
    const el = document.getElementById('dinoOverlay'); if(el) el.style.display = 'block';
    const img = document.getElementById('dinoImg'); if(img) img.textContent = '🦖';
    showDinoOverlay('feed','获得恐龙宝贝!',ANIM_DURATION);
    updateDinoDisplay();
  }
}

function dinoFeed(n){
  if(!hasDino) return;
  dinoFeedCount += n;
  // small feed animation
  showDinoOverlay('feed','喂食 +' + n, ANIM_DURATION);
  // check evolution thresholds
  if(dinoStage < 1 && dinoFeedCount >= 50){
    dinoStage = 1; updateDinoDisplay(); showDinoOverlay('evolve','恐龙进化为 恐龙战士!',ANIM_DURATION);
  }
  if(dinoStage < 2 && dinoFeedCount >= 200){
    dinoStage = 2; // legendary
    // give badge
    if(!dinoBadge){ dinoBadge = true; updateDinoDisplay(); showDinoOverlay('badge','获得恐龙勋章!',ANIM_DURATION); }
  }
  // C2: every 50 feeds give 1 coin (only one C2 effective)
  const hasC2 = playerCards.some(c=>/^C2/.test(c));
  if(hasC2){
    const milestone = Math.floor(dinoFeedCount/50);
    if(milestone > dinoLastC2Milestone){
      const times = milestone - dinoLastC2Milestone; dinoLastC2Milestone = milestone; addCoins(times);
    }
  }
  // C3: every 30 feeds restore 5 HP (only one C3 effective)
  const hasC3 = playerCards.some(c=>/^C3/.test(c));
  if(hasC3){
    const milestone3 = Math.floor(dinoFeedCount/30);
    if(milestone3 > dinoLastC3Milestone){
      const times = milestone3 - dinoLastC3Milestone; dinoLastC3Milestone = milestone3; playerHP = Math.min(playerMaxHP, playerHP + 5*times); updateInfo();
    }
  }
  updateInfo();
}

function getC4Count(){ return playerCards.filter(c=>/^C4/.test(c)).length; }

function getCClassList(){ return playerCards.filter(c=>c[0]==='C'); }

function handleDinoLandingEat(){
  if(!hasDino) return;
  dinoLandingCount++;
  if(dinoStage >= 1 && (dinoLandingCount % 15 === 0)){
    // dinosaur eats bottom row: remove the entire bottom row (like a line clear)
    showDinoOverlay('eat','恐龙开始吃掉底层...',ANIM_DURATION);
    setTimeout(()=>{
      const y = arena.length - 1;
      let removed = 0;
      for(let x=0;x<arena[y].length;x++) if(arena[y][x] !== 0) removed++;
      // remove bottom row and shift above rows down (like normal line clear)
      arena.splice(y,1);
      arena.unshift(new Array(COLS).fill(0));
      // award per removed block (base 500, modified by C4 and badge)
      const c4 = getC4Count();
      const basePerBlock = 200 * (1 + 0.5 * c4);
      const cClassNum = cClassCount();
      const badgeBonusPerBlock = dinoBadge ? (cClassNum * 200 * (1 + 0.3 * c4)) : 0;
      const totalGain = Math.floor(removed * (basePerBlock + badgeBonusPerBlock));
      if(removed>0){ player.score += totalGain; animateFloatingScore(window.innerWidth/2, window.innerHeight/2, '+' + totalGain); }
      // each eaten block counts as a feed
      if(removed>0) dinoFeed(removed);
      // after shifting, check for normal line clears
      sweep();
      updateInfo();
    }, 800);
  }
}
// HP, timer, character
let playerChar = 'superman'; // 'superman'|'cowboy'|'hunter'
let playerHP = 100;
let playerMaxHP = 100;
let levelTimeLimit = 90; // seconds per level (稍短以更专注的节奏)
let levelTimeLeft = levelTimeLimit;
let levelTimerId = null;
let levelFailAttempts = 0; // counts fails on current level
let consecutiveSuccesses = 0; // for superman effect
// snapshot for restarting level on fail
let levelStartSnapshot = { score:0, lines:0 };

// Explicit targets for levels 1..10 (smoother progression) — doubled per request
const LEVEL_TARGETS = [600,1800,4000,8000,14000,24000,40000,70000,120000,240000];

function update(time=0){
  const deltaTime = time - lastTime;
  lastTime = time;
  if(gameStarted && !paused){
    dropCounter += deltaTime;
    if(dropCounter > dropInterval) playerDrop();
  }
  draw();
  drawNext();
  requestAnimationFrame(update);
}

function gameOver(){
  paused = true;
  alert('游戏结束！得分: ' + player.score);
}

const player = { pos:{x:0,y:0}, matrix:null, score:0, level:1, lines:0 };

// controls
document.addEventListener('keydown', e=>{
  // 新增: A/S/D/R 快捷键（保留原有方向键与 Z/X/Enter/Space 行为）
  if(e.key==='a' || e.key==='A' || e.key==='ArrowLeft') playerMove(-1);
  else if(e.key==='d' || e.key==='D' || e.key==='ArrowRight') playerMove(1);
  else if(e.key==='s' || e.key==='S' || e.key==='ArrowDown') playerDrop();
  else if(e.key==='Enter'){ // hard drop
    while(!collide(arena, player)) player.pos.y++;
    player.pos.y--;
    merge(arena, player);
    playerReset();
    sweep();
  }
  else if(e.key==='z' || e.key==='Z') playerRotate(-1);
  else if(e.key==='x' || e.key==='X') playerRotate(1);
  else if(e.key==='r' || e.key==='R') playerRotate(1);
  else if(e.key===' '){ // space toggles pause
    e.preventDefault();
    togglePause();
  }
});

startBtn.addEventListener('click', ()=>{
  startFromUI();
});
bigStart && bigStart.addEventListener('click', ()=>{ startFromUI(); });
pauseBtn.addEventListener('click', ()=>{ togglePause(); });

// mode toggle UI: show/hide character or test class selection
try{
  const modeRadios = Array.from(document.querySelectorAll('input[name="mode"]'));
  const charSelect = document.getElementById('charSelect');
  const testClassSelect = document.getElementById('testClassSelect');
  modeRadios.forEach(r=>r.addEventListener('change', ()=>{
    const v = document.querySelector('input[name="mode"]:checked').value;
    if(v === 'test'){ if(charSelect) charSelect.style.display = 'none'; if(testClassSelect) testClassSelect.style.display = 'block'; }
    else { if(charSelect) charSelect.style.display = 'block'; if(testClassSelect) testClassSelect.style.display = 'none'; }
  }));
}catch(e){}

// leaderboard button bindings
try{
  const vbtn = document.getElementById('viewLeaderboard');
  const closeLB = document.getElementById('closeLeaderboard');
  if(vbtn) vbtn.addEventListener('click', ()=>{ showLeaderboardModal(); });
  if(closeLB) closeLB.addEventListener('click', ()=>{ document.getElementById('leaderboardModal').style.display='none'; });
}catch(e){}

function startFromUI(){
  if(startScreen) startScreen.style.display = 'none';
  // read selected mode
  try{
    const mode = document.querySelector('input[name="mode"]:checked');
    if(mode && mode.value === 'test'){
      testMode = true;
      const tc = document.querySelector('input[name="testClass"]:checked');
      testModeClass = tc ? tc.value : 'A';
      // in test mode there is no character mechanic
      playerChar = null;
    } else {
      testMode = false; testModeClass = null;
      const sel = document.querySelector('input[name="char"]:checked');
      if(sel) playerChar = sel.value;
    }
  }catch(e){ }
  // show pre-start card choice (only numbered 1 cards), then begin game
  showPreStartChoice();
}

function beginGameAfterSetup(){
  // apply character initial effects (only in normal mode)
  if(playerChar === 'superman'){
    playerMaxHP = Math.min(150, playerMaxHP + 50);
    playerHP = Math.min(playerMaxHP, playerHP + playerMaxHP - playerHP);
    playerHP = playerMaxHP;
  }
  resetGame();
  gameStarted = true;
  paused = false;
  pauseBtn.textContent = '暂停';
}

function showPreStartChoice(){
  // build a transient modal for pre-start choice
  const overlay = document.createElement('div'); overlay.className='overlay';
  overlay.style.zIndex = 100;
  const inner = document.createElement('div'); inner.className='overlay-inner';
  inner.innerHTML = '<h3>开始前：选择一张开局卡牌（仅编号1的卡牌）</h3>';
  const choices = document.createElement('div'); choices.className='card-choices';
  const maxNum = 1;
  const cards = [generateRandomCard(maxNum), generateRandomCard(maxNum), generateRandomCard(maxNum)];
  let selected = null;
  cards.forEach(id=>{
    const d = document.createElement('div'); d.className='card'; d.innerHTML = `<div class="id">${id}</div><div class="desc">${getCardDescription(id)}</div>`;
    d.addEventListener('click', ()=>{
      Array.from(choices.children).forEach(c=>c.classList.remove('selected'));
      d.classList.add('selected'); selected = id;
    });
    choices.appendChild(d);
  });
  inner.appendChild(choices);
  const btnRow = document.createElement('div'); btnRow.style.marginTop='12px';
  const ok = document.createElement('button'); ok.textContent='确认并开始'; ok.disabled = true;
  const cancel = document.createElement('button'); cancel.textContent='取消'; cancel.style.marginLeft='8px';
  choices.addEventListener('click', ()=>{ ok.disabled = !Array.from(choices.children).some(c=>c.classList.contains('selected')); });
  ok.addEventListener('click', ()=>{
    if(selected) applyCardEffect(selected);
    overlay.remove();
    // after card selection, show task choice then begin
    showTaskChoice(beginGameAfterSetup);
  });
  cancel.addEventListener('click', ()=>{ overlay.remove(); startScreen.style.display='flex'; });
  btnRow.appendChild(ok); btnRow.appendChild(cancel); inner.appendChild(btnRow);
  overlay.appendChild(inner); document.body.appendChild(overlay);
}

function animateScoreFromRow(rowIndex, text){
  try{
    const rect = canvas.getBoundingClientRect();
    const fromX = rect.left + rect.width/2;
    const fromY = rect.top + (rowIndex * BLOCK) + BLOCK/2;
    animateFloatingScore(fromX, fromY, text);
  }catch(e){/* ignore if not in DOM */}
}

function animateFloatingScore(fromX, fromY, text){
  const el = document.createElement('div');
  el.className = 'floating-score';
  el.textContent = text;
  document.body.appendChild(el);
  // initial placement
  el.style.left = (fromX - 20) + 'px';
  el.style.top = (fromY - 10) + 'px';
  const targetRect = scoreEl.getBoundingClientRect();
  // animate toward score element
  requestAnimationFrame(()=>{
    el.style.transform = `translateY(${targetRect.top - fromY}px)`;
    el.style.left = (targetRect.left + (targetRect.width/2) - 20) + 'px';
    el.style.opacity = '1';
  });
  setTimeout(()=>{ el.classList.add('hide'); }, 700);
  setTimeout(()=>{ el.remove(); }, 1400);
}

function togglePause(){
  paused = !paused;
  pauseBtn.textContent = paused ? '继续' : '暂停';
}

function resetGame(){
  for(let y=0;y<arena.length;y++) arena[y].fill(0);
  player.score = 0; player.level = 1; player.lines = 0;
  currentLevel = 1;
  playerCards = [];
  activeEffects = [];
  // reset stars
  starLayers = 0;
  // reset HP/time/fails
  levelFailAttempts = 0;
  consecutiveSuccesses = 0;
  levelTimeLeft = levelTimeLimit;
  clearInterval(levelTimerId);
  levelTimerId = null;
  // default hp settings (if not modified by character)
  if(playerChar !== 'superman'){
    playerMaxHP = 100;
    playerHP = playerMaxHP;
  }
  playerReset();
  dropInterval = dropTimeByLevel(player.level);
  paused = false;
  updateInfo();
}

// speed adjust when level increases
const levelCheckInterval = setInterval(()=>{
  dropInterval = dropTimeByLevel(player.level);
}, 500);

// init
playerReset();
updateInfo();
update();
