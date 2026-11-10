import test from 'node:test';
import assert from 'node:assert/strict';

import { tentukanTema } from '../src/tema.js';

test('tema: pilihan pengguna menang atas sistem, kosong = ikut sistem', () => {
  assert.equal(tentukanTema('gelap', false), 'gelap');
  assert.equal(tentukanTema('terang', true), 'terang');
  assert.equal(tentukanTema('', true), 'gelap');
  assert.equal(tentukanTema(null, false), 'terang');
  assert.equal(tentukanTema('apa-saja', true), 'gelap');
});
