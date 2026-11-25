import test from 'node:test';
import assert from 'node:assert/strict';

import SnakeGame from '../js/game.js';

const { STATE } = SnakeGame;

function makeGame(options = {}) {
  return new SnakeGame({ random: () => 0, ...options });
}

function startGame(options = {}) {
  const game = makeGame(options);
  game.start();
  return game;
}

function head(game) {
  return game.snake[0];
}

function onSnake(game, cell) {
  return game.snake.some((segment) => segment.x === cell.x && segment.y === cell.y);
}

function placeFoodAhead(game) {
  const current = head(game);
  const delta = SnakeGame.DIRECTIONS[game.direction];
  game.food = { x: current.x + delta.x, y: current.y + delta.y };
}

test('初始状态为准备开始，蛇长 3，食物不在蛇身上', () => {
  const game = makeGame();

  assert.equal(game.state, STATE.READY);
  assert.equal(game.score, 0);
  assert.equal(game.snake.length, 3);
  assert.deepEqual(head(game), { x: 10, y: 10 });
  assert.equal(game.direction, 'right');
  assert.ok(game.food);
  assert.equal(onSnake(game, game.food), false);
});

test('开始后每个 tick 前进一格', () => {
  const game = startGame();
  game.food = { x: 0, y: 0 };

  assert.deepEqual(game.step(), { type: 'move' });
  assert.deepEqual(head(game), { x: 11, y: 10 });
  assert.equal(game.snake.length, 3);
  assert.equal(game.score, 0);
});

test('吃到食物后蛇身增长并得分', () => {
  const game = startGame();
  placeFoodAhead(game);
  const oldLength = game.snake.length;

  assert.deepEqual(game.step(), { type: 'eat' });
  assert.equal(game.snake.length, oldLength + 1);
  assert.equal(game.score, SnakeGame.SCORE_PER_FOOD);
  assert.deepEqual(head(game), { x: 11, y: 10 });
  assert.notDeepEqual(game.food, { x: 11, y: 10 });
  assert.equal(onSnake(game, game.food), false);
});

test('不能原地转向，也不能直接掉头', () => {
  const game = startGame();

  assert.equal(game.turn('right'), false);
  assert.equal(game.turn('left'), false);
  assert.equal(game.pendingDirections.length, 0);

  game.step();
  assert.deepEqual(head(game), { x: 11, y: 10 });
});

test('连续两次转向按顺序在下两次移动中生效', () => {
  const game = startGame();

  assert.equal(game.turn('up'), true);
  assert.equal(game.turn('left'), true);
  assert.deepEqual(game.pendingDirections, ['up', 'left']);

  game.step();
  assert.deepEqual(head(game), { x: 10, y: 9 });

  game.step();
  assert.deepEqual(head(game), { x: 9, y: 9 });
});

test('超出转向缓存上限的输入会被忽略', () => {
  const game = startGame();

  assert.equal(game.turn('up'), true);
  assert.equal(game.turn('left'), true);
  assert.equal(game.turn('down'), false);
  assert.deepEqual(game.pendingDirections, ['up', 'left']);
});

test('撞到墙壁时游戏结束，蛇保持原位', () => {
  const game = startGame();
  game.snake = [
    { x: 19, y: 10 },
    { x: 18, y: 10 },
    { x: 17, y: 10 },
  ];
  game.direction = 'right';
  game.food = { x: 0, y: 0 };

  assert.deepEqual(game.step(), { type: 'game-over', reason: 'wall' });
  assert.equal(game.state, STATE.GAME_OVER);
  assert.equal(game.reason, 'wall');
  assert.deepEqual(head(game), { x: 19, y: 10 });
  assert.equal(game.snake.length, 3);

  // 结束后不再移动。
  assert.equal(game.step(), null);
});

test('撞到自己时游戏结束', () => {
  const game = startGame();
  game.snake = [
    { x: 5, y: 5 },
    { x: 4, y: 5 },
    { x: 4, y: 4 },
    { x: 5, y: 4 },
    { x: 6, y: 4 },
  ];
  game.direction = 'up';
  game.food = { x: 0, y: 0 };

  assert.deepEqual(game.step(), { type: 'game-over', reason: 'self' });
  assert.equal(game.state, STATE.GAME_OVER);
  assert.equal(game.reason, 'self');
  assert.equal(game.snake.length, 5);
});

test('移动到尾巴即将离开的格子不算撞到自己', () => {
  const game = startGame();
  game.snake = [
    { x: 5, y: 5 },
    { x: 4, y: 5 },
    { x: 4, y: 4 },
    { x: 5, y: 4 },
  ];
  game.direction = 'up';
  game.food = { x: 0, y: 0 };

  assert.deepEqual(game.step(), { type: 'move' });
  assert.deepEqual(head(game), { x: 5, y: 4 });
  assert.equal(game.state, STATE.RUNNING);
});

test('暂停后不再移动，继续后恢复', () => {
  const game = startGame();
  game.step();
  const pausedHead = head(game);

  assert.equal(game.pause(), true);
  assert.equal(game.state, STATE.PAUSED);
  assert.equal(game.step(), null);
  assert.deepEqual(head(game), pausedHead);

  assert.equal(game.resume(), true);
  assert.equal(game.state, STATE.RUNNING);
  game.step();
  assert.notDeepEqual(head(game), pausedHead);
});

test('状态机：开始、暂停、继续的重复调用被安全忽略', () => {
  const game = makeGame();

  assert.equal(game.start(), true);
  assert.equal(game.start(), false);
  assert.equal(game.pause(), true);
  assert.equal(game.pause(), false);
  assert.equal(game.resume(), true);
  assert.equal(game.resume(), false);
  assert.equal(game.togglePause(), true);
  assert.equal(game.state, STATE.PAUSED);
});

test('重新开始会重置分数、蛇身和状态', () => {
  const game = startGame();
  placeFoodAhead(game);
  game.step();
  game.snake = [
    { x: 19, y: 10 },
    { x: 18, y: 10 },
    { x: 17, y: 10 },
  ];
  game.direction = 'right';
  game.step();
  assert.equal(game.state, STATE.GAME_OVER);
  assert.equal(game.score, SnakeGame.SCORE_PER_FOOD);

  game.restart();

  assert.equal(game.state, STATE.RUNNING);
  assert.equal(game.score, 0);
  assert.equal(game.snake.length, 3);
  assert.deepEqual(head(game), { x: 10, y: 10 });
  assert.equal(game.direction, 'right');
  assert.equal(game.reason, null);
});

test('食物总是生成在空格中', () => {
  [0, 0.25, 0.5, 0.75, 0.999].forEach((value) => {
    const game = makeGame({ random: () => value });
    assert.equal(onSnake(game, game.food), false, `random=${value} 时食物落在蛇身上`);
    game.snake.push({ x: 0, y: 0 });
    game.spawnFood();
    assert.equal(onSnake(game, game.food), false, `random=${value} 时重新生成落在蛇身上`);
  });
});

test('棋盘被填满时判定通关', () => {
  const game = startGame({ cols: 3, rows: 2 });
  game.snake = [
    { x: 1, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 1 },
    { x: 1, y: 1 },
    { x: 2, y: 1 },
  ];
  game.direction = 'right';
  game.food = { x: 2, y: 0 };

  assert.deepEqual(game.step(), { type: 'won' });
  assert.equal(game.state, STATE.WON);
  assert.equal(game.score, SnakeGame.SCORE_PER_FOOD);
  assert.equal(game.food, null);
});

test('spawnFood 在棋盘没有空格时返回 false', () => {
  const game = makeGame({ cols: 2, rows: 2 });
  game.snake = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: 1, y: 1 },
  ];

  assert.equal(game.spawnFood(), false);
  assert.equal(game.food, null);
});

test('未开始或暂停时不能转向', () => {
  const game = makeGame();
  assert.equal(game.turn('up'), false);

  game.start();
  game.pause();
  assert.equal(game.turn('up'), false);
});
