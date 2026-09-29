'use strict';

// The everyday path: add teams, score them, sort, persist, remove.
const { openBoard, press, stored, places } = require('./helpers');

module.exports = async function ({ browser, ok }) {
  const page = await openBoard(browser, { viewport: { width: 390, height: 780 }, touch: true });
  const touch = true;

  ok((await page.textContent('tbody')).includes('No teams yet'), 'empty board says so');

  for (const name of ['Alpha', 'Beta', 'Gamma']) {
    await page.fill('#team-name', name);
    await press(page, '#add-form button', touch);
  }
  ok(await page.locator('tbody tr').count() === 3, 'three teams added by tapping');

  // score across a row: Enter commits and moves on
  await press(page, 'tbody tr:nth-child(1) td.score[data-field="0"]', touch);
  await page.keyboard.type('7');
  await page.keyboard.press('Enter');
  const advanced = await page.evaluate(() => {
    const input = document.querySelector('tbody tr:nth-child(1) input');
    return input && input.closest('td').previousElementSibling.dataset.field === '0';
  });
  ok(advanced, 'Enter commits and advances to the next round');

  await page.keyboard.type('10');
  await page.keyboard.press('Enter');
  await page.keyboard.type('99');          // clamps to 10
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');

  const scores = await stored(page);
  ok(scores[0] === 'Alpha:[7,10,10,null,null]', 'scores clamped to 0-10 and saved: ' + scores[0]);

  const totalCell = await page.evaluate(() =>
    document.querySelector('tbody tr:nth-child(1) .total-position').firstChild.textContent.trim());
  ok(totalCell === '27', 'total computed (got ' + totalCell + ')');
  ok((await page.textContent('tbody tr:nth-child(1) td.total')).replace(/\s+/g, ' ').trim() === '27 1st',
     'total and place read as one cell');

  const ranks = await places(page);
  ok(ranks[0] === '1st', 'leader placed first');
  ok(JSON.stringify(ranks) === JSON.stringify(['1st', '2nd', '2nd']), 'ties share a place: ' + ranks.join(','));

  // rename in place
  await press(page, 'tbody tr:nth-child(2) td.name', touch);
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Renamed');
  await page.keyboard.press('Enter');
  ok((await page.textContent('tbody')).includes('Renamed'), 'rename by tapping the name');

  await press(page, 'th[data-sort="name"]', touch);
  const byName = await page.$$eval('td.name', els => els.map(e => e.textContent.trim()));
  ok(byName[0] === 'Alpha', 'sorts by name: ' + byName.join(','));
  await press(page, 'th[data-sort="name"]', touch);
  const reversed = await page.$$eval('td.name', els => els.map(e => e.textContent.trim()));
  ok(reversed[0] === 'Renamed', 'a second tap reverses: ' + reversed.join(','));

  await page.reload();
  ok(await page.locator('tbody tr').count() === 3 && (await page.textContent('tbody')).includes('Renamed'),
     'restored from localStorage after reload');

  await press(page, 'tbody tr:nth-child(1) td.edit button', touch);
  page.once('dialog', d => d.accept());
  await press(page, '#edit-delete', touch);
  ok(await page.locator('tbody tr').count() === 2, 'team removed through the dialog');

  ok(page.errors.length === 0, 'no page errors: ' + page.errors.join(' | '));
  await page.context().close();
};
