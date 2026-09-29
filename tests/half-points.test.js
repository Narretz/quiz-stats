'use strict';

// Scores snap to the nearest half point.
const { openBoard, press, stored } = require('./helpers');

module.exports = async function ({ browser, ok }) {
  const page = await openBoard(browser);

  for (const name of ['Alpha', 'Bravo']) {
    await page.fill('#team-name', name);
    await page.click('#add-form button');
  }

  // open R1 of row 1, then walk the row with Enter
  await press(page, 'tbody tr:nth-child(1) td.score[data-field="0"]');
  for (const value of ['7.5', '2.3', '2.2', '10', '0.5']) {   // 2.3 -> 2.5, 2.2 -> 2
    await page.keyboard.type(value);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(20);
  }
  await page.keyboard.press('Escape');

  const scores = await stored(page);
  ok(scores[0] === 'Alpha:[7.5,2.5,2,10,0.5]', 'halves kept, snapped to the nearest 0.5: ' + scores[0]);

  const shown = await page.$$eval('tbody tr:nth-child(1) td.score', els => els.map(e => e.textContent.trim()));
  ok(shown.join(',') === '7.5,2.5,2,10,0.5', 'rendered as stored: ' + shown.join(','));

  const total = await page.evaluate(() =>
    document.querySelector('tbody tr:nth-child(1) .total-position').firstChild.textContent.trim());
  ok(total === '22.5', 'half totals sum exactly, with no float noise (got ' + total + ')');

  const rank = await page.evaluate(() => {
    const cell = document.querySelector('tbody tr:nth-child(1) td.total');
    return cell.querySelector('.rank').textContent + cell.querySelector('.rank-indicator').textContent;
  });
  ok(rank === '1st', 'place still computed from a fractional total (got ' + rank + ')');

  const attrs = await page.evaluate(() => {
    document.querySelector('tbody tr:nth-child(2) td.score[data-field="0"]')
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    const input = document.querySelector('tbody input');
    return input.step + '/' + input.inputMode + '/' + input.min + '-' + input.max;
  });
  ok(attrs === '0.5/decimal/0-10', 'the input keeps step 0.5 and the decimal keypad (got ' + attrs + ')');

  ok(page.errors.length === 0, 'no page errors: ' + page.errors.join(' | '));
  await page.context().close();
};
