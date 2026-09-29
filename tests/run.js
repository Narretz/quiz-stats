#!/usr/bin/env node
'use strict';

// Runs the browser tests against index.html.
//
//   npm test              every suite
//   npm test -- modal     just the suites whose name contains "modal"
//
// Needs a Chromium: `npx playwright install chromium`, or set CHROMIUM_PATH to
// one you already have.

const { launch } = require('./helpers');

const SUITES = ['flow', 'editing', 'half-points', 'dialog', 'csv', 'quizzes'];

(async () => {
  const wanted = process.argv.slice(2);
  const suites = wanted.length
    ? SUITES.filter(name => wanted.some(w => name.includes(w)))
    : SUITES;

  if (!suites.length) {
    console.error('No suite matches ' + wanted.join(', ') + '. Known: ' + SUITES.join(', '));
    process.exit(2);
  }

  const browser = await launch();
  let passed = 0;
  const failures = [];

  for (const name of suites) {
    const run = require('./' + name + '.test.js');
    const results = [];
    const ok = (condition, message) => results.push({ condition: !!condition, message });

    console.log('\n' + name);
    try {
      await run({ browser, ok });
    } catch (e) {
      results.push({ condition: false, message: 'suite threw: ' + (e && e.message) });
    }

    for (const r of results) {
      console.log('  ' + (r.condition ? 'ok  ' : 'FAIL') + '  ' + r.message);
      if (r.condition) passed++;
      else failures.push(name + ' - ' + r.message);
    }
  }

  await browser.close();

  console.log('\n' + passed + ' passed, ' + failures.length + ' failed');
  failures.forEach(f => console.log('  FAIL  ' + f));
  process.exit(failures.length ? 1 : 0);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
