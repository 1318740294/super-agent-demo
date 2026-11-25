(function () {
  'use strict';

  const SnakeGame = window.SnakeGame;
  const STATE = SnakeGame.STATE;
  const TICK_MS = 140;

  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const statusEl = document.getElementById('status');
  const overlay = document.getElementById('overlay');
  const overlayKicker = document.getElementById('overlay-kicker');
  const overlayTitle = document.getElementById('overlay-title');
  const overlayText = document.getElementById('overlay-text');
  const overlayAction = document.getElementById('overlay-action');
  const overlayHint = document.getElementById('overlay-hint');
  const pauseBtn = document.getElementById('pause-btn');
  const restartBtn = document.getElementById('restart-btn');

  const game = new SnakeGame({ cols: 20, rows: 20 });

  // 仅在 ?debug=1 时暴露实例，供自动化测试读取状态。
  if (new URLSearchParams(window.location.search).has('debug')) {
    window.__snakeGame = game;
  }

  const KEY_TO_DIRECTION = {
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
  };

  const STATUS_TEXT = {
    [STATE.READY]: '准备开始',
    [STATE.RUNNING]: '游戏中',
    [STATE.PAUSED]: '已暂停',
    [STATE.GAME_OVER]: '游戏结束',
    [STATE.WON]: '通关',
  };

  const OVERLAY_CONTENT = {
    [STATE.READY]: {
      kicker: 'READY',
      title: '准备开始',
      text: '方向键控制移动，吃到食物加 10 分',
      action: '开始游戏',
      hint: '空格 暂停 / 继续 · R 重新开始',
    },
    [STATE.PAUSED]: {
      kicker: 'PAUSED',
      title: '已暂停',
      text: '休息一下，随时继续',
      action: '继续游戏',
      hint: '按空格也可以继续',
    },
    [STATE.GAME_OVER]: {
      kicker: 'GAME OVER',
      title: '游戏结束',
      text: '',
      action: '再来一局',
      hint: '按 R 或空格快速重开',
    },
    [STATE.WON]: {
      kicker: 'PERFECT',
      title: '完美通关！',
      text: '你填满了整个棋盘',
      action: '再来一局',
      hint: '按 R 或空格快速重开',
    },
  };

  let boardSize = 600;
  let dpr = 1;
  let lastFrame = 0;
  let accumulator = 0;
  let lastState = null;
  let lastReason = null;

  /* ---------- 画布尺寸 ---------- */

  function resizeBoard() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    dpr = window.devicePixelRatio || 1;
    boardSize = rect.width;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    render();
  }

  /* ---------- 绘制 ---------- */

  function lerpColor(from, to, t) {
    const a = parseInt(from.slice(1), 16);
    const b = parseInt(to.slice(1), 16);
    const mix = (shift) => {
      const channelA = (a >> shift) & 255;
      const channelB = (b >> shift) & 255;
      return Math.round(channelA + (channelB - channelA) * t);
    };
    return `rgb(${mix(16)}, ${mix(8)}, ${mix(0)})`;
  }

  function roundRectPath(x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(x, y, width, height, r);
      return;
    }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function drawBoard(size, cell) {
    const background = ctx.createLinearGradient(0, 0, size, size);
    background.addColorStop(0, '#0d1729');
    background.addColorStop(1, '#070e1a');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = 'rgba(130, 255, 180, 0.055)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < game.cols; i += 1) {
      const position = Math.round(i * cell) + 0.5;
      ctx.moveTo(position, 0);
      ctx.lineTo(position, size);
      ctx.moveTo(0, position);
      ctx.lineTo(size, position);
    }
    ctx.stroke();
  }

  function drawFood(cell) {
    if (!game.food) return;
    const centerX = game.food.x * cell + cell / 2;
    const centerY = game.food.y * cell + cell / 2;
    const radius = cell * 0.3;
    const pulse = 1 + Math.sin(performance.now() / 260) * 0.04;

    ctx.save();
    ctx.shadowColor = 'rgba(255, 107, 107, 0.75)';
    ctx.shadowBlur = cell * 0.7;

    const skin = ctx.createRadialGradient(
      centerX - radius * 0.35,
      centerY - radius * 0.4,
      radius * 0.1,
      centerX,
      centerY,
      radius * pulse,
    );
    skin.addColorStop(0, '#ffb3a8');
    skin.addColorStop(0.45, '#ff6b6b');
    skin.addColorStop(1, '#d63c4b');
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius * pulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.beginPath();
    ctx.arc(centerX - radius * 0.32, centerY - radius * 0.36, radius * 0.18, 0, Math.PI * 2);
    ctx.fill();

    // 小叶子
    ctx.fillStyle = '#58d97f';
    ctx.beginPath();
    ctx.ellipse(
      centerX + radius * 0.36,
      centerY - radius * 0.78,
      radius * 0.36,
      radius * 0.18,
      -Math.PI / 4,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.restore();
  }

  function drawSnake(cell) {
    const total = game.snake.length;

    for (let index = total - 1; index >= 0; index -= 1) {
      const segment = game.snake[index];
      const t = total === 1 ? 0 : index / (total - 1);
      const inset = cell * 0.055;
      const radius = cell * 0.3;

      ctx.save();
      if (index === 0) {
        ctx.shadowColor = 'rgba(109, 255, 158, 0.8)';
        ctx.shadowBlur = cell * 0.55;
      }
      ctx.fillStyle = index === 0 ? '#c9ff9d' : lerpColor('#6dff9e', '#1a8f4a', t * 0.9);
      roundRectPath(
        segment.x * cell + inset,
        segment.y * cell + inset,
        cell - inset * 2,
        cell - inset * 2,
        radius,
      );
      ctx.fill();
      ctx.restore();
    }

    drawEyes(cell);
  }

  function drawEyes(cell) {
    const head = game.snake[0];
    if (!head) return;
    const centerX = head.x * cell + cell / 2;
    const centerY = head.y * cell + cell / 2;
    const forward = SnakeGame.DIRECTIONS[game.direction];
    const side = { x: -forward.y, y: forward.x };
    const eyeRadius = cell * 0.075;

    ctx.fillStyle = '#06210f';
    [-1, 1].forEach((sign) => {
      const x = centerX + forward.x * cell * 0.16 + side.x * cell * 0.18 * sign;
      const y = centerY + forward.y * cell * 0.16 + side.y * cell * 0.18 * sign;
      ctx.beginPath();
      ctx.arc(x, y, eyeRadius, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function render() {
    if (!boardSize) return;
    const cell = boardSize / game.cols;
    ctx.clearRect(0, 0, boardSize, boardSize);
    drawBoard(boardSize, cell);
    drawFood(cell);
    drawSnake(cell);
  }

  /* ---------- 界面状态 ---------- */

  function overlayTextFor(state) {
    if (state === STATE.GAME_OVER) {
      const cause = game.reason === 'self' ? '撞到自己了' : '撞到墙壁了';
      return `${cause}，本局得分 ${game.score}`;
    }
    return OVERLAY_CONTENT[state] ? OVERLAY_CONTENT[state].text : '';
  }

  function syncUI() {
    const state = game.state;

    if (scoreEl.textContent !== String(game.score)) {
      scoreEl.textContent = String(game.score);
      scoreEl.classList.remove('is-bumped');
      // 强制重排以便重复触发数字放大动画。
      void scoreEl.offsetWidth;
      scoreEl.classList.add('is-bumped');
      window.setTimeout(() => scoreEl.classList.remove('is-bumped'), 180);
    }

    if (state !== lastState || game.reason !== lastReason) {
      statusEl.textContent = STATUS_TEXT[state] || '';
      statusEl.dataset.state = state;

      pauseBtn.textContent = state === STATE.PAUSED ? '继续' : '暂停';
      pauseBtn.disabled = !(state === STATE.RUNNING || state === STATE.PAUSED);

      const content = OVERLAY_CONTENT[state];
      if (content) {
        overlay.dataset.state = state;
        overlayKicker.textContent = content.kicker;
        overlayTitle.textContent = content.title;
        overlayText.textContent = overlayTextFor(state);
        overlayAction.textContent = content.action;
        overlayHint.textContent = content.hint;
        overlay.classList.remove('is-hidden');
      } else {
        overlay.classList.add('is-hidden');
      }

      lastState = state;
      lastReason = game.reason;
    } else if (state === STATE.GAME_OVER) {
      overlayText.textContent = overlayTextFor(state);
    }

  }

  /* ---------- 游戏循环 ---------- */

  function tick() {
    const event = game.step();
    if (event && event.type === 'game-over') {
      syncUI();
      render();
    }
  }

  function frame(timestamp) {
    window.requestAnimationFrame(frame);

    if (!lastFrame) lastFrame = timestamp;
    const delta = Math.min(timestamp - lastFrame, 250);
    lastFrame = timestamp;

    if (game.state === STATE.RUNNING) {
      accumulator += delta;
      while (accumulator >= TICK_MS) {
        accumulator -= TICK_MS;
        tick();
        if (game.state !== STATE.RUNNING) break;
      }
    } else {
      accumulator = 0;
    }

    syncUI();
    render();
  }

  /* ---------- 交互 ---------- */

  function startGame() {
    if (game.state === STATE.READY) {
      game.start();
      accumulator = 0;
    }
    syncUI();
  }

  function restartGame() {
    game.restart();
    accumulator = 0;
    syncUI();
  }

  function togglePause() {
    game.togglePause();
    accumulator = 0;
    syncUI();
  }

  function handleOverlayAction() {
    if (game.state === STATE.READY) {
      startGame();
    } else if (game.state === STATE.PAUSED) {
      game.resume();
      accumulator = 0;
      syncUI();
    } else {
      restartGame();
    }
  }

  window.addEventListener('keydown', (event) => {
    const direction = KEY_TO_DIRECTION[event.key];
    if (direction) {
      event.preventDefault();
      if (game.state === STATE.READY) startGame();
      if (game.state === STATE.RUNNING) {
        game.turn(direction);
      }
      syncUI();
      return;
    }

    if (event.code === 'Space') {
      event.preventDefault();
      if (event.repeat) return;
      if (game.state === STATE.READY) {
        startGame();
      } else if (game.state === STATE.PAUSED) {
        game.resume();
        accumulator = 0;
        syncUI();
      } else if (game.state === STATE.GAME_OVER || game.state === STATE.WON) {
        restartGame();
      } else {
        togglePause();
      }
      return;
    }

    if (event.key === 'r' || event.key === 'R') {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      event.preventDefault();
      if (event.repeat) return;
      restartGame();
      return;
    }

    if (event.key === 'Enter' && !event.repeat) {
      if (game.state === STATE.READY) {
        event.preventDefault();
        startGame();
      } else if (game.state === STATE.GAME_OVER || game.state === STATE.WON) {
        event.preventDefault();
        restartGame();
      }
    }
  });

  overlayAction.addEventListener('click', handleOverlayAction);
  pauseBtn.addEventListener('click', togglePause);
  restartBtn.addEventListener('click', restartGame);

  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(resizeBoard).observe(canvas);
  } else {
    window.addEventListener('resize', resizeBoard);
  }

  resizeBoard();
  syncUI();
  window.requestAnimationFrame(frame);
})();
