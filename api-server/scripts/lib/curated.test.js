const { test } = require('node:test');
const assert = require('node:assert/strict');
const { acceptsBroadcast } = require('./curated');
const { prepareGame } = require('./pgn');
const { storageProfile } = require('../../config/storage');

test('curation requires broadcast provenance, a GM and a clear classical time control', () => {
  const tags = { BroadcastURL: 'https://lichess.org/broadcast/sample', WhiteTitle: 'GM', Site: 'Trieste' };
  const profile = storageProfile('mvp');
  for (const TimeControl of ['90m+30s', '90min/40moves + 30min + 30sec/move', "90' + 30'' each move", '1:30:30', '5400+30']) {
    assert.equal(acceptsBroadcast({ ...tags, TimeControl }, profile), true, TimeControl);
  }
  for (const TimeControl of ['90+30', '600', '10 minutes + 5 seconds', undefined]) {
    assert.equal(acceptsBroadcast({ ...tags, TimeControl }, profile), false, TimeControl);
  }
  assert.equal(acceptsBroadcast({ ...tags, TimeControl: '90m', Site: 'Online' }, profile), false);
  assert.equal(acceptsBroadcast({ ...tags, TimeControl: '90m', WhiteTitle: 'IM' }, profile), false);
  assert.equal(acceptsBroadcast({ ...tags, TimeControl: '90m', BroadcastURL: 'https://example.org/broadcast' }, profile), false);
});

test('normalized identity ignores annotations, ratings and line wrapping', () => {
  const first = prepareGame({
    headers: { WhiteElo: '2400' }, body: ['1. e4 e5 2. Nf3 Nc6 1-0'],
  }, { includeMovetext: true });
  const second = prepareGame({
    headers: { WhiteElo: '2500' }, body: ['1. e4 { comment } e5', '2. Nf3 Nc6 1-0'],
  }, { includeMovetext: true });
  assert.notEqual(first.pgn, second.pgn);
  assert.deepEqual(first.movetext, second.movetext);
  assert.deepEqual(first.movetext.slice(1), ['e2e4', 'e7e5', 'g1f3', 'b8c6']);
});
