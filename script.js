const SVG_NS = "http://www.w3.org/2000/svg";
const SVG_ROOT = document.getElementsByTagName("svg")[0];
const BOARD_SIZE = 19;
const STAR_START = 3;
const STAR_STEP = 6;
const BLACK = 0;
const WHITE = 1;
const X0 = 21.15;
const Y0 = 20.925;
const DX = 33;
const DY = 35.55;
const WIDTH = 2 * X0 + (BOARD_SIZE - 1) * DX;

let board = newGrid(null);
let stones = newGrid(null);
let player = BLACK;
let enemy = WHITE;

let wheeling = false;
let undoStack = [];
let redoStack = [];

function newGrid(value) {
  let result = [];
  for (let i = 0; i < BOARD_SIZE; i++) {
    result.push([]);
    for (let j = 0; j < BOARD_SIZE; j++)
      result[i].push(value);
  }
  return result;
}

function addSVG(tag, attributes) {
  let elem = document.createElementNS(SVG_NS, tag);
  for (let key in attributes)
    elem.setAttribute(key, attributes[key]);
  SVG_ROOT.appendChild(elem);
  return elem;
}

function drawBoard() {
  for (let i = 0; i < BOARD_SIZE; i++) {
    addSVG("line", {
      x1: X0 + i * DX,
      y1: Y0,
      x2: X0 + i * DX,
      y2: Y0 + (BOARD_SIZE - 1) * DY
    });
    addSVG("line", {
      x1: X0,
      y1: Y0 + i * DY,
      x2: X0 + (BOARD_SIZE - 1) * DX,
      y2: Y0 + i * DY,
    });
  }
  for (let i = STAR_START; i < BOARD_SIZE; i += STAR_STEP) {
    for (let j = STAR_START; j < BOARD_SIZE; j += STAR_STEP) {
      addSVG("circle", {
        class: "star-point",
        cx: X0 + i * DX,
        cy: Y0 + j * DY,
      });
    }
  }
}

// Precondition: board[i][j] === null
function placeStone(i, j) {
  board[i][j] = player;
  stones[i][j] = addSVG(
    "circle",
    {
      class: "stone",
      cx: X0 + i * DX,
      cy: Y0 + j * DY,
      fill: player === BLACK ? "black" : "white"
    }
  );
}

function offsetToCoord(x, y) {
  let scale = WIDTH / SVG_ROOT.getBoundingClientRect().width;
  x *= scale;
  y *= scale;

  let clamp = (x) => {
    x = Math.max(x, 0);
    x = Math.min(x, BOARD_SIZE - 1);
    return x;
  };
  let i = Math.round(clamp((x - X0) / DX));
  let j = Math.round(clamp((y - Y0) / DY));
  return [i, j];
}

function inRange(i, j) {
  return i >= 0 && i < BOARD_SIZE && j >= 0 && j < BOARD_SIZE;
}

function neighbors(i, j) {
  let result = [];
  for (let [di, dj] of [[-1, 0], [1, 0], [0, -1], [0, 1]])
    if (inRange(i + di, j + dj))
      result.push([i + di, j + dj]);
  return result;
}

// Precondition: (i, j) has a stone
function libertiesRecursive(i, j, visited) {
  visited[i][j] = true;
  let result = 0;
  for (let [ii, jj] of neighbors(i, j)) {
    if (visited[ii][jj])
      continue;
    else if (board[ii][jj] === null)
      result++;
    else if (board[ii][jj] === board[i][j])
      result += libertiesRecursive(ii, jj, visited);
  }
  return result;
}

// Precondition: (i, j) has a stone
function liberties(i, j) {
  let visited = newGrid(false);
  return libertiesRecursive(i, j, visited);
}

// Precondition: (i, j) has a stone
function removeStone(i, j) {
  board[i][j] = null;
  stones[i][j].remove();
  stones[i][j] = null;
}

// Precondition: (i, j) has a stone
function findGroup(i, j, group, visited) {
  group.push([i, j]);
  visited[i][j] = true;
  for (let [ii, jj] of neighbors(i, j))
    if (board[ii][jj] === board[i][j] && !visited[ii][jj])
      findGroup(ii, jj, group, visited);
}

function neighborsCaptured(i, j) {
  let result = [];
  for (let [ii, jj] of neighbors(i, j))
    if (board[ii][jj] === enemy && liberties(ii, jj) == 0)
      result.push([ii, jj]);
  return result;
}

function isCapture(i, j) {
  return neighborsCaptured(i, j).length > 0;
}

function isSameMove(i1, j1, i2, j2) {
  return i1 === i2 && j1 === j2;
}

function isKo(i, j) {
  let n = undoStack.length;
  if (n === 0)
    return false;
  
  let captured = findAllCaptures(i, j);
  if (captured.length !== 1)
    return false;
  
  let [[ii, jj], prevCaptured] = undoStack[n - 1];
  if (prevCaptured.length !== 1)
    return false;
  
  return isSameMove(i, j, ...prevCaptured[0]) &&
    isSameMove(ii, jj, ...captured[0]);
}

function canPlay(i, j) {
  if (board[i][j] !== null)
    return false;
  board[i][j] = player;
  let result = isCapture(i, j) ?
      !isKo(i, j) : liberties(i, j) > 0;
  board[i][j] = null;
  return result;
}

function findAllCaptures(i, j) {
  let captured = [];
  let visited = newGrid(false);
  for (let [ii, jj] of neighborsCaptured(i, j))
    findGroup(ii, jj, captured, visited);
  return captured;
}

function play(i, j) {
  placeStone(i, j);
  let captured = findAllCaptures(i, j);
  for (let [ii, jj] of captured)
    removeStone(ii, jj);
  [player, enemy] = [enemy, player];
  undoStack.push([[i, j], captured]);
}

function handleClick(e) {
  let [i, j] = offsetToCoord(e.offsetX, e.offsetY);
  if (canPlay(i, j)) {
    play(i, j);
    redoStack = [];
  }
}

function undo() {
  if (undoStack.length === 0)
    return;
  let [[i, j], captured] = undoStack.pop();
  removeStone(i, j);
  for (let [ii, jj] of captured)
    placeStone(ii, jj);
  [player, enemy] = [enemy, player];
  redoStack.push([i, j]);
}

function redo() {
  if (redoStack.length === 0)
    return;
  let [i, j] = redoStack.pop();
  play(i, j);
}

function handleKeyDown(e) {
  switch (e.keyCode) {
    case 88:
      redo();
      break;
    case 90:
      undo();
      break;
    default:
      break;
  } 
}

function handleWheel(e) {
  if (!wheeling) {
    requestAnimationFrame(() => {
      if (e.deltaY > 0) {
        undo();
      } else {
        redo();
      }
      wheeling = false;
    });
    wheeling = true;
  }
}

drawBoard();
SVG_ROOT.addEventListener("click", handleClick);
document.addEventListener("keydown", handleKeyDown);
document.addEventListener("wheel", handleWheel);
