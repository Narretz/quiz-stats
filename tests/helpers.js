'use strict';

const path = require('path');
const { chromium } = require('playwright');

const APP_URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
const STORAGE_KEY = 'quiz-scoreboard';

// Chromium comes from `npx playwright install chromium`. Point CHROMIUM_PATH at
// a binary you already have if you would rather not download another one.
function launch() {
  const options = {};
  if (process.env.CHROMIUM_PATH) options.executablePath = process.env.CHROMIUM_PATH;
  return chromium.launch(options);
}

// A board in a known state. `teams` is written straight to localStorage as the
// one stored quiz, so a seed can include shapes the UI would not let you type.
// `raw` writes storage verbatim instead, for testing what older shapes load as.
async function openBoard(browser, options) {
  options = options || {};
  const viewport = options.viewport || { width: 900, height: 800 };
  const touch = !!options.touch;

  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
  if (options.init) await context.addInitScript(options.init);

  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));

  await page.goto(APP_URL);
  await page.evaluate(([key, teams, raw]) => {
    if (raw !== null) { localStorage.setItem(key, JSON.stringify(raw)); return; }
    if (!teams) { localStorage.removeItem(key); return; }
    localStorage.setItem(key, JSON.stringify({
      version: 2,
      quizzes: [{ id: 'seed-quiz', name: 'Test quiz', created: 1700000000000, teams: teams }],
      currentId: 'seed-quiz',
    }));
  }, [STORAGE_KEY, options.teams || null, options.raw === undefined ? null : options.raw]);
  await page.reload();
  return page;
}

// A real press holds the button for a moment. Firing down and up in the same
// tick hides bugs - it is exactly what made a broken editor-switch fix look
// like it worked - so every press in these tests waits in between.
async function press(page, target, touch) {
  const box = typeof target === 'string' ? await page.locator(target).boundingBox() : target;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  if (touch) {
    await page.touchscreen.tap(x, y);
  } else {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(120);
    await page.mouse.up();
  }
  await page.waitForTimeout(30);
}

// The teams of the quiz currently on screen.
const stored = page => page.evaluate(key => {
  const raw = JSON.parse(localStorage.getItem(key) || 'null');
  if (!raw || !raw.quizzes) return [];
  const quiz = raw.quizzes.filter(q => q.id === raw.currentId)[0] || raw.quizzes[0];
  return (quiz ? quiz.teams : []).map(t => t.name + ':' + JSON.stringify(t.scores));
}, STORAGE_KEY);

// Every stored quiz, for the multi-quiz tests.
const storedQuizzes = page => page.evaluate(key => {
  const raw = JSON.parse(localStorage.getItem(key) || 'null');
  if (!raw || !raw.quizzes) return { names: [], current: null, teamCounts: [] };
  const current = raw.quizzes.filter(q => q.id === raw.currentId)[0];
  return {
    names: raw.quizzes.map(q => q.name),
    current: current ? current.name : null,
    teamCounts: raw.quizzes.map(q => q.teams.length),
  };
}, STORAGE_KEY);

const notes = page => page.$$eval('.note .note-text', els => els.map(e => e.textContent));
const clearNotes = page => page.$$eval('.note-close', els => els.forEach(e => e.click()));

// Which cell the open editor is in, as "<team #> R3" or "<team #> name".
const openCell = page => page.evaluate(() => {
  const input = document.querySelector('tbody input');
  if (!input) return null;
  const cell = input.closest('td');
  const row = cell.closest('tr');
  const seq = row.querySelector('td.seq').textContent.trim();
  return cell.cellIndex === 1 ? seq + ' name' : seq + ' R' + (cell.cellIndex - 1);
});

// The rank digit and its suffix are separate elements in the total cell.
const places = page => page.$$eval('td.total', cells => cells.map(c =>
  c.querySelector('.rank').textContent.trim() + c.querySelector('.rank-indicator').textContent.trim()));

module.exports = {
  APP_URL, STORAGE_KEY, launch, openBoard, press,
  stored, storedQuizzes, notes, clearNotes, openCell, places,
};
