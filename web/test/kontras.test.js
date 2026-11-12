import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { bacaToken, rasio, periksa } = require('../scripts/kontras.cjs');

test('kontras: rumus WCAG (hitam/putih 21:1, #777 di putih ~4,48:1)', () => {
  assert.equal(Math.round(rasio('#ffffff', '#000000')), 21);
  assert.equal(Math.round(rasio('#777777', '#ffffff') * 100) / 100, 4.48);
  assert.equal(rasio('#fff', '#000'), rasio('#000', '#fff'));
});

test('kontras: token gelap menimpa token terang, nilai bukan heksa diabaikan', () => {
  const css = ':root { --a: #111111; --b: #222; --g: linear-gradient(red, blue); } :root[data-tema="gelap"] { --a: #eeeeee; }';
  assert.deepEqual(bacaToken(css, 'terang'), { a: '#111111', b: '#222' });
  assert.deepEqual(bacaToken(css, 'gelap'), { a: '#eeeeee', b: '#222' });
});

test('kontras: semua pasangan teks-latar di tokens.css lulus (terang dan gelap)', () => {
  const css = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');
  const gagal = periksa(css).filter((x) => !x.lulus);
  assert.deepEqual(gagal, []);
});
