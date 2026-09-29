'use strict';

// Copy as CSV. navigator.clipboard is replaced with a recorder so the test
// needs no clipboard permission, and can force the write to fail.
const { openBoard, press, notes, clearNotes } = require('./helpers');

const Q = String.fromCharCode(34);
const TEAMS = [
  { id: 'a', seq: 1, name: 'Alpha', scores: [7.5, 8, 9, 10, 6] },
  { id: 'b', seq: 2, name: 'Brown, Fox & ' + Q + 'Quizzers' + Q, scores: [1, 2, 3, 4, 5] },
  { id: 'c', seq: 10, name: 'Carol', scores: [5, 5, null, 5, 5] },
];

const recordClipboard = () => {
  window.__copied = [];
  window.__failWrite = false;
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: text => window.__failWrite
        ? Promise.reject(new Error('blocked'))
        : (window.__copied.push(text), Promise.resolve()),
    },
  });
};

module.exports = async function ({ browser, ok }) {
  const page = await openBoard(browser, { teams: TEAMS, init: recordClipboard });
  const copied = () => page.evaluate(() => window.__copied);

  await page.click('#copy-csv');
  const csv = (await copied())[0];
  const lines = csv.split('\r\n');

  ok(csv.includes('\r\n'), 'CRLF line endings, as RFC 4180 and Excel expect');
  ok(lines[0] === 'Team,R1,R2,R3,R4,R5,Total', 'header row: ' + lines[0]);
  ok(!/(^|,)#(,|$)/.test(lines[0]) && !/Place/.test(lines[0]), 'no # column and no Place column');
  ok(!lines.some(l => /(^|,)(1st|2nd|3rd)(,|$)/.test(l)), 'no ordinal leaked into a row');
  ok(lines.length === 4, 'one line per team plus the header');
  ok(lines[1] === 'Alpha,7.5,8,9,10,6,40.5', 'half points survive: ' + lines[1]);
  ok(lines[2] === 'Carol,5,5,,5,5,20', 'an unplayed round is an empty cell: ' + lines[2]);
  ok(lines[3] === Q + 'Brown, Fox & ' + Q + Q + 'Quizzers' + Q + Q + Q + ',1,2,3,4,5,15',
     'commas and quotes escaped: ' + lines[3]);
  ok((await notes(page))[0] === 'Copied 3 teams as CSV.', 'reports what was copied');
  await clearNotes(page);

  await page.click('th[data-sort="name"]');
  await page.click('#copy-csv');
  const sorted = (await copied())[1].split('\r\n').slice(1);
  ok(sorted[0].startsWith('Alpha') && sorted[1].startsWith(Q + 'Brown') && sorted[2].startsWith('Carol'),
     'rows follow the on-screen sort');
  await clearNotes(page);

  // a value still being typed is committed by the press on the button
  await page.click('th[data-sort="total"]');
  await press(page, 'tbody tr:nth-child(1) td.score[data-field="0"]');
  await page.fill('tbody input', '0.5');
  await page.click('#copy-csv');
  const live = (await copied()).slice(-1)[0].split('\r\n')[1];
  ok(live === 'Alpha,0.5,8,9,10,6,33.5', 'a value still being typed is included: ' + live);
  await clearNotes(page);

  // clipboard blocked -> falls back to a textarea and execCommand
  await page.evaluate(() => { window.__failWrite = true; });
  await page.click('#copy-csv');
  await page.waitForTimeout(80);
  const afterFail = await notes(page);
  ok(afterFail.length === 1, 'a blocked clipboard still reports an outcome: ' + afterFail[0]);
  await clearNotes(page);

  await page.evaluate(() => localStorage.removeItem('quiz-scoreboard'));
  await page.reload();
  await page.click('#copy-csv');
  ok((await notes(page))[0] === 'There is nothing to copy yet.', 'an empty board says so instead of copying a header');

  ok(page.errors.length === 0, 'no page errors: ' + page.errors.join(' | '));
  await page.context().close();
};
