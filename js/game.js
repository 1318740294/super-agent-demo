/*
 * 贪吃蛇核心逻辑：纯 JavaScript，不依赖 DOM，可在浏览器与 Node 中复用。
 */
(function (root, factory) {
  const SnakeGame = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = SnakeGame;
  } else {
    root.SnakeGame = SnakeGame;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DIRECTIONS = Object.freeze({
    up: Object.freeze({ x: 0, y: -1 }),
    down: Object.freeze({ x: 0, y: 1 }),
    left: Object.freeze({ x: -1, y: 0 }),
    right: Object.freeze({ x: 1, y: 0 }),
  });

  const STATE = Object.freeze({
    READY: 'ready',
    RUNNING: 'running',
    PAUSED: 'paused',
    GAME_OVER: 'game-over',
    WON: 'won',
  });

  const OPPOSITE = Object.freeze({
    up: 'down',
    down: 'up',
    left: 'right',
    right: 'left',
  });

  const SCORE_PER_FOOD = 10;
  const MAX_QUEUED_TURNS = 2;

  class SnakeGame {
    constructor(options = {}) {
      this.cols = options.cols || 20;
      this.rows = options.rows || 20;
      this.random = typeof options.random === 'function' ? options.random : Math.random;
      this.scorePerFood = options.scorePerFood || SCORE_PER_FOOD;
      this.reset();
    }

    /** 回到初始状态：蛇位于棋盘中央，向右，等待开始。 */
    reset() {
      const centerX = Math.floor(this.cols / 2);
      const centerY = Math.floor(this.rows / 2);
      this.snake = [
        { x: centerX, y: centerY },
        { x: centerX - 1, y: centerY },
        { x: centerX - 2, y: centerY },
      ];
      this.direction = 'right';
      this.pendingDirections = [];
      this.score = 0;
      this.state = STATE.READY;
      this.reason = null;
      this.food = null;
      this.spawnFood();
    }

    start() {
      if (this.state !== STATE.READY) return false;
      this.state = STATE.RUNNING;
      return true;
    }

    pause() {
      if (this.state !== STATE.RUNNING) return false;
      this.state = STATE.PAUSED;
      return true;
    }

    resume() {
      if (this.state !== STATE.PAUSED) return false;
      this.state = STATE.RUNNING;
      return true;
    }

    togglePause() {
      if (this.state === STATE.RUNNING) return this.pause();
      if (this.state === STATE.PAUSED) return this.resume();
      return false;
    }

    /** 重开一局，并立即进入游戏。 */
    restart() {
      this.reset();
      this.start();
    }

    /** 记录一次转向，在下一次移动时生效。 */
    turn(direction) {
      if (this.state !== STATE.RUNNING) return false;
      if (!Object.prototype.hasOwnProperty.call(DIRECTIONS, direction)) return false;
      if (this.pendingDirections.length >= MAX_QUEUED_TURNS) return false;

      const last = this.pendingDirections.length
        ? this.pendingDirections[this.pendingDirections.length - 1]
        : this.direction;

      // 原地不动或直接掉头都没有意义，直接忽略。
      if (direction === last || direction === OPPOSITE[last]) return false;

      this.pendingDirections.push(direction);
      return true;
    }

    /**
     * 前进一格。返回本次移动产生的事件：
     * move | eat | game-over | won，未在运行中时返回 null。
     */
    step() {
      if (this.state !== STATE.RUNNING) return null;

      if (this.pendingDirections.length) {
        this.direction = this.pendingDirections.shift();
      }

      const delta = DIRECTIONS[this.direction];
      const head = this.snake[0];
      const next = { x: head.x + delta.x, y: head.y + delta.y };
      const eats = this.food !== null && next.x === this.food.x && next.y === this.food.y;

      if (next.x < 0 || next.x >= this.cols || next.y < 0 || next.y >= this.rows) {
        return this.endGame('wall');
      }

      // 不进食时尾巴会离开，因此尾巴当前所在格不算碰撞。
      const body = eats ? this.snake : this.snake.slice(0, -1);
      if (body.some((segment) => segment.x === next.x && segment.y === next.y)) {
        return this.endGame('self');
      }

      this.snake.unshift(next);

      if (eats) {
        this.score += this.scorePerFood;
        if (!this.spawnFood()) {
          this.state = STATE.WON;
          return { type: 'won' };
        }
        return { type: 'eat' };
      }

      this.snake.pop();
      return { type: 'move' };
    }

    endGame(reason) {
      this.state = STATE.GAME_OVER;
      this.reason = reason;
      return { type: 'game-over', reason };
    }

    /** 在空格中随机放置食物；棋盘填满时返回 false。 */
    spawnFood() {
      const occupied = new Set(this.snake.map((segment) => `${segment.x},${segment.y}`));
      const free = [];
      for (let y = 0; y < this.rows; y += 1) {
        for (let x = 0; x < this.cols; x += 1) {
          if (!occupied.has(`${x},${y}`)) free.push({ x, y });
        }
      }

      if (!free.length) {
        this.food = null;
        return false;
      }

      const index = Math.min(free.length - 1, Math.floor(this.random() * free.length));
      this.food = free[index];
      return true;
    }
  }

  SnakeGame.DIRECTIONS = DIRECTIONS;
  SnakeGame.STATE = STATE;
  SnakeGame.SCORE_PER_FOOD = SCORE_PER_FOOD;

  return SnakeGame;
});
