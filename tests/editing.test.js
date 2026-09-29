'use strict';

// Moving between cell editors. The press timing matters here: firing mousedown
// and mouseup in the same tick made a broken fix look like it worked.
const { openBoard, press, stored, openCell } = require('./helpers');

const TEAMS = [
  { id: 'a', seq: 1, name: 'Alpha', scores: [null, null, null, null, null] },
  { id: 'b', seq: 2, name: 'Bravo', scores: [null, null, null, null, null] },
  { id: 'c', seq: 3, name: 'Carol', scores: [null, null, null, null, null] },
];

module.exports = async function ({ browser, ok }) {
  for (const touch of [false, true]) {
    const tag = touch ? '[touch]' : '[mouse]';
    const page = await openBoard(browser, {
      teams: TEAMS,
      viewport: touch ? { width: 390, height: 780 } : { width: 900, height: 700 },
      touch,
    });
    const hit = sel => press(page, sel, touch);

    await hit('tbody tr:nth-child(1) td.score[data-field="0"]');
    await page.keyboard.type('7');
    await hit('tbody tr:nth-child(2) td.score[data-field="2"]');
    ok(await openCell(page) === '2 R3', tag + ' one press moves the editor (got ' + await openCell(page) + ')');
    ok((await stored(page))[0] === 'Alpha:[7,null,null,null,null]', tag + ' typed value saved on the way out');

    await page.keyboard.type('4');
    await hit('tbody tr:nth-child(3) td.name');
    ok(await openCell(page) === '3 name', tag + ' score to name in one press');
    ok((await stored(page))[1] === 'Bravo:[null,null,4,null,null]', tag + ' score saved when moving to a name');

    // pressing the cell that is already open must not restart the editor
    await page.keyboard.press('Escape');
    const same = await page.locator('tbody tr:nth-child(1) td.score[data-field="4"]').boundingBox();
    await press(page, same, touch);
    await page.keyboard.type('5');
    await press(page, same, touch);
    ok(await page.evaluate(() => document.querySelector('tbody input').value) === '5',
       tag + ' pressing the open cell again keeps what you typed');

    await hit('h1');
    ok(await openCell(page) === null, tag + ' pressing outside closes the editor');
    ok((await stored(page))[0] === 'Alpha:[7,null,null,null,5]', tag + ' value saved on close');

    await hit('tbody tr:nth-child(2) td.score[data-field="0"]');
    await page.keyboard.type('8');
    await hit('tbody tr:nth-child(3) td.edit button');
    page.once('dialog', d => d.accept());
    await page.click('#edit-delete');
    ok((await stored(page)).length === 2, tag + ' the dialog opens in one press while editing, then deletes');
    ok((await stored(page)).some(s => s.startsWith('Bravo:[8,')), tag + ' the edit was saved before the delete');

    await hit('tbody tr:nth-child(1) td.score[data-field="1"]');
    await page.keyboard.type('3');
    await hit('th[data-sort="total"]');
    ok((await stored(page)).some(s => s.includes(',3,')), tag + ' sorting mid-edit saves the value');

    await hit('tbody tr:nth-child(1) td.score[data-field="3"]');
    await page.keyboard.type('2');
    await hit('#team-name');
    await page.keyboard.type('Delta');
    ok(await page.inputValue('#team-name') === 'Delta', tag + ' the add-team field takes focus mid-edit');
    ok((await stored(page)).some(s => s.includes(',2,')), tag + ' value saved when leaving for the add field');

    ok(page.errors.length === 0, tag + ' no page errors: ' + page.errors.join(' | '));
    await page.context().close();
  }
};
