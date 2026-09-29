'use strict';

// The edit dialog and the notifications it posts.
const { openBoard, stored, notes, clearNotes } = require('./helpers');

const TEAMS = [
  { id: 'a', seq: 1, name: 'Alpha', scores: [7, 8, 9, 10, 6] },
  { id: 'b', seq: 2, name: 'Bravo', scores: [1, 2, 3, 4, 5] },
  { id: 'c', seq: 3, name: 'Carol', scores: [5, 5, 5, 5, 5] },
];

module.exports = async function ({ browser, ok }) {
  const page = await openBoard(browser, { teams: TEAMS });

  ok((await notes(page)).length === 0 && await page.isHidden('#modal-backdrop'),
     'starts with no notes and a closed dialog');

  // --- a duplicate name is refused ---
  await page.fill('#team-name', 'alpha');
  await page.click('#add-form button');
  ok((await notes(page))[0].includes('already a team called "alpha"'), 'duplicate name is refused with a notification');
  ok((await stored(page)).length === 3, 'the duplicate is not added, not even under a different case');
  ok(await page.inputValue('#team-name') === 'alpha', 'the typed name stays in the field so it can be edited');
  await clearNotes(page);

  await page.fill('#team-name', 'Delta');
  await page.click('#add-form button');
  ok((await stored(page)).length === 4 && (await notes(page)).length === 0, 'a genuinely new name still adds, silently');
  await page.click('tbody tr:nth-child(4) td.edit button');
  page.once('dialog', d => d.accept());
  await page.click('#edit-delete');
  await clearNotes(page);

  // --- opening does not grab a field ---
  await page.click('tbody tr[data-id="a"] td.edit button');
  const onOpen = await page.evaluate(() => document.activeElement.tagName + ':' + (document.activeElement.className || ''));
  ok(onOpen === 'DIV:modal', 'opening focuses the dialog, not a field (got ' + onOpen + ')');
  await page.keyboard.press('Escape');
  ok(await page.isHidden('#modal-backdrop'), 'Escape closes straight away when no field was touched');
  ok((await notes(page)).length === 0, 'opening and closing without edits says nothing');

  // --- fields apply on blur and echo back what was stored ---
  await page.click('tbody tr[data-id="a"] td.edit button');
  await page.fill('#edit-round-0', '2.3');
  await page.focus('#edit-round-1');
  ok(await page.inputValue('#edit-round-0') === '2.5', 'blur applies and snaps, the field echoes 2.5');
  ok((await stored(page)).some(t => t === 'Alpha:[2.5,8,9,10,6]'), 'the board updates live, with no Save');

  await page.fill('#edit-round-1', '99');
  await page.focus('#edit-name');
  ok(await page.inputValue('#edit-round-1') === '10', 'out of range clamps and the field echoes 10');

  await page.fill('#edit-name', '   ');
  await page.focus('#edit-round-0');
  ok(await page.inputValue('#edit-name') === 'Alpha', 'a blank name springs back to the stored one');

  // --- Escape cancels the field first, then closes ---
  await page.fill('#edit-round-2', '4');
  await page.keyboard.press('Escape');
  ok(await page.inputValue('#edit-round-2') === '9' && await page.isVisible('#modal-backdrop'),
     'Escape reverts the focused field and keeps the dialog open');
  await page.keyboard.press('Escape');
  ok(await page.isHidden('#modal-backdrop'), 'a second Escape closes it');

  // --- undo on close ---
  const after = await notes(page);
  ok(after.length === 1 && after[0] === 'Updated "Alpha".', 'closing after edits offers undo: ' + after[0]);
  await page.click('.note-action');
  ok((await stored(page)).some(t => t === 'Alpha:[7,8,9,10,6]'), 'undo restores every field at once');
  ok((await notes(page)).length === 0, 'the note clears after undo');

  await page.click('tbody tr[data-id="a"] td.edit button');
  await page.click('#edit-done');
  ok(await page.isHidden('#modal-backdrop') && (await notes(page)).length === 0, 'no changes, no notification');

  // --- Done commits the field that still has focus ---
  await page.click('tbody tr[data-id="b"] td.edit button');
  await page.fill('#edit-round-4', '0.5');
  await page.click('#edit-done');
  ok((await stored(page)).some(t => t === 'Bravo:[1,2,3,4,0.5]'), 'Done commits the field that still had focus');
  ok(await page.evaluate(() => !!document.activeElement.closest('td.edit')), 'focus returns to the row edit button');
  await clearNotes(page);

  // --- delete asks first, then offers undo ---
  await page.click('tbody tr[data-id="c"] td.edit button');
  await page.fill('#edit-name', 'Carol Edited');
  page.once('dialog', d => d.dismiss());
  await page.click('#edit-delete');
  ok((await stored(page)).some(t => t.startsWith('Carol')) && await page.isVisible('#modal-backdrop'),
     'cancelling the confirm keeps the team and the dialog');

  page.once('dialog', async d => { ok(d.message().includes('Carol'), 'the confirm names the team: ' + d.message()); await d.accept(); });
  await page.click('#edit-delete');
  const removal = await notes(page);
  ok(removal.length === 1 && removal[0].startsWith('Removed'), 'delete posts only the removal note: ' + JSON.stringify(removal));
  ok(!(await stored(page)).some(t => t.startsWith('Carol')), 'the team is gone');
  await page.click('.note-action');
  ok((await stored(page)).some(t => t.startsWith('Carol')), 'undo restores the deleted team');

  // --- the backdrop commits rather than discarding ---
  await page.click('tbody tr[data-id="a"] td.edit button');
  await page.fill('#edit-round-3', '1');
  await page.mouse.click(20, 20);
  ok(await page.isHidden('#modal-backdrop'), 'clicking the backdrop closes the dialog');
  ok((await stored(page)).some(t => t === 'Alpha:[7,8,9,1,6]'), 'the backdrop commits rather than discarding');

  ok(page.errors.length === 0, 'no page errors: ' + page.errors.join(' | '));
  await page.context().close();
};
