'use strict';

// Several quizzes in one board: storing them, switching, and carrying teams
// from one to the next.
const { openBoard, stored, storedQuizzes, notes, clearNotes } = require('./helpers');

const TEAMS = [
  { id: 'a', seq: 1, name: 'Alpha', scores: [7, 8, 9, 10, 6] },
  { id: 'b', seq: 2, name: 'Bravo', scores: [1, 2, 3, 4, 5] },
];

// answer the next prompt/confirm
const answer = (page, value) => page.once('dialog', d => value === false ? d.dismiss() : d.accept(value === true ? '' : value));

module.exports = async function ({ browser, ok }) {
  // --- a version 1 board is carried over, not lost ---
  let page = await openBoard(browser, { raw: TEAMS });   // the old bare-array shape
  let quizzes = await storedQuizzes(page);
  ok(quizzes.names.length === 1 && quizzes.teamCounts[0] === 2, 'a v1 board becomes one quiz with its teams');
  ok((await stored(page))[0] === 'Alpha:[7,8,9,10,6]', 'the migrated scores are intact');
  ok(/^Quiz /.test(quizzes.names[0]), 'the migrated quiz gets a dated name: ' + quizzes.names[0]);
  ok(await page.textContent('#quiz-label') === quizzes.names[0], 'the toolbar shows the quiz on screen');
  await page.context().close();

  page = await openBoard(browser, { teams: TEAMS });

  // --- a new quiz ---
  answer(page, false);
  await page.click('#new-quiz');
  ok((await storedQuizzes(page)).names.length === 1, 'cancelling the name prompt adds nothing');

  answer(page, 'Week 2');
  await page.click('#new-quiz');
  quizzes = await storedQuizzes(page);
  ok(quizzes.names.length === 2 && quizzes.current === 'Week 2', 'a new quiz is created and shown');
  ok((await stored(page)).length === 0, 'the new quiz starts with no teams');
  ok(quizzes.teamCounts.indexOf(2) >= 0, 'the previous quiz is kept with its teams');
  ok(await page.textContent('#quiz-label') === 'Week 2', 'the toolbar follows the new quiz');
  await clearNotes(page);

  // --- teams belong to one quiz ---
  await page.fill('#team-name', 'Only In Week 2');
  await page.click('#add-form button');
  ok((await stored(page)).length === 1, 'a team added here lands in this quiz');

  // --- the stored list ---
  await page.click('#show-quizzes');
  ok(await page.isVisible('#quizzes-backdrop'), 'Quizzes opens the list');
  const rows = await page.$$eval('.quiz-row', els => els.map(e => ({
    name: e.querySelector('.quiz-row-name').value,
    meta: e.querySelector('.quiz-row-meta').textContent,
    current: e.classList.contains('is-current'),
    acts: [...e.querySelectorAll('button[data-act]')].map(b => b.dataset.act),
  })));
  ok(rows.length === 2, 'both quizzes are listed');
  ok(rows.filter(r => r.current).length === 1 && rows.find(r => r.current).name === 'Week 2',
     'the quiz on screen is marked');
  ok(rows.find(r => r.current).meta.includes('showing now'), 'and says so: ' + rows.find(r => r.current).meta);
  ok(rows.find(r => !r.current).acts.join(',') === 'open,reuse,delete', 'the others offer open, reuse and delete');
  ok(rows.find(r => r.current).acts.indexOf('open') < 0, 'the current quiz has no Open button');

  // --- switching ---
  await page.click('.quiz-row:not(.is-current) button[data-act="open"]');
  ok(await page.isHidden('#quizzes-backdrop'), 'opening a quiz closes the list');
  ok((await stored(page))[0] === 'Alpha:[7,8,9,10,6]', 'the board swaps to that quiz');
  ok((await storedQuizzes(page)).current === 'Test quiz', 'and the choice is stored');

  // --- start a new quiz from an existing one ---
  await page.click('#show-quizzes');
  answer(page, 'Week 3');
  await page.click('.quiz-row.is-current button[data-act="reuse"]');
  quizzes = await storedQuizzes(page);
  ok(quizzes.names.length === 3 && quizzes.current === 'Week 3', 'reuse creates and shows a new quiz');
  const carried = await stored(page);
  ok(carried.join(' | ') === 'Alpha:[null,null,null,null,null] | Bravo:[null,null,null,null,null]',
     'the teams come across with their scores cleared: ' + carried.join(' | '));
  ok(await page.$$eval('td.seq', els => els.map(e => e.textContent.trim()).sort().join(',')) === '1,2',
     'the carried teams are renumbered from one');
  ok((await notes(page))[0].includes('from "Test quiz"'), 'says where the teams came from');
  await clearNotes(page);

  // --- reuse needs teams to carry ---
  answer(page, 'Empty One');
  await page.click('#new-quiz');
  await clearNotes(page);
  ok((await storedQuizzes(page)).current === 'Empty One', 'a fourth, empty quiz to reuse from');

  await page.click('#show-quizzes');
  // No dialog handler on purpose: reaching the prompt at all would be a bug,
  // and a stale once() handler would swallow the next confirm.
  await page.click('.quiz-row.is-current button[data-act="reuse"]');
  ok((await storedQuizzes(page)).names.length === 4, 'an empty quiz has nothing to carry, so nothing is created');
  ok((await notes(page))[0].includes('no teams'), 'and it says why: ' + (await notes(page))[0]);
  ok(await page.isVisible('#quizzes-backdrop'), 'the list stays open when nothing happened');
  await clearNotes(page);

  // --- rename in the list ---
  await page.fill('.quiz-row.is-current .quiz-row-name', 'Renamed Empty');
  await page.click('#quizzes-title');                       // blur
  ok((await storedQuizzes(page)).current === 'Renamed Empty', 'renaming in the list is saved');
  ok(await page.textContent('#quiz-label') === 'Renamed Empty', 'the toolbar label follows the rename');

  await page.fill('.quiz-row.is-current .quiz-row-name', '   ');
  await page.click('#quizzes-title');
  ok(await page.inputValue('.quiz-row.is-current .quiz-row-name') === 'Renamed Empty',
     'a blank name springs back');

  // --- delete, with confirm and undo ---
  answer(page, false);
  await page.click('.quiz-row:not(.is-current) button[data-act="delete"]');
  ok((await storedQuizzes(page)).names.length === 4, 'cancelling the confirm keeps the quiz');

  answer(page, true);
  await page.click('.quiz-row:not(.is-current) button[data-act="delete"]');
  ok((await storedQuizzes(page)).names.length === 3, 'confirming deletes it');
  ok((await notes(page))[0].startsWith('Deleted'), 'and offers undo: ' + (await notes(page))[0]);
  await page.click('.note-action');
  ok((await storedQuizzes(page)).names.length === 4, 'undo brings the quiz back');
  await clearNotes(page);

  ok(page.errors.length === 0, 'no page errors: ' + page.errors.join(' | '));
  await page.context().close();

  // --- deleting the only quiz leaves an empty one, and undo clears it up ---
  page = await openBoard(browser, { teams: TEAMS });
  await page.click('#show-quizzes');
  answer(page, true);
  await page.click('.quiz-row.is-current button[data-act="delete"]');
  quizzes = await storedQuizzes(page);
  ok(quizzes.names.length === 1 && quizzes.teamCounts[0] === 0, 'deleting the last quiz leaves an empty board');
  await page.click('.note-action');
  quizzes = await storedQuizzes(page);
  ok(quizzes.names.length === 1 && quizzes.teamCounts[0] === 2,
     'undo restores it without leaving the empty one behind: ' + JSON.stringify(quizzes.names));

  await page.keyboard.press('Escape');
  ok(await page.isHidden('#quizzes-backdrop'), 'Escape closes the list');
  ok(page.errors.length === 0, 'no page errors: ' + page.errors.join(' | '));
  await page.context().close();
};
