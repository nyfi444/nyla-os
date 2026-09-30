// The merge that replaces "pick a device". Every case here is a way two
// devices can disagree; the rule throughout is that nothing she wrote is lost.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { merge } = require('../js/sync-merge.js');

const J = v => JSON.stringify(v);
const P = s => JSON.parse(s);
const task = (id, text, extra = {}) => ({ id, text, done: false, ...extra });

test('nothing changed: nothing to do', () => {
  const s = { nylaos_tasks: J([task(1, 'a')]) };
  const r = merge(s, { ...s }, { ...s });
  assert.deepEqual(r.toLocal, {}); assert.equal(r.toRemote, false); assert.equal(r.kept.length, 0);
});

test('the false conflict: this device changed nothing, the other changed a lot', () => {
  const base = { nylaos_tasks: J([task(1, 'a')]), nylaos_note_x: 'old', nylaos_ideas: J([{ id: 9, title: 'i' }]) };
  const remote = { nylaos_tasks: J([task(1, 'a', { done: true }), task(2, 'b')]), nylaos_note_x: 'new words', nylaos_ideas: J([{ id: 9, title: 'i' }]) };
  const r = merge({ ...base }, remote, base);
  assert.deepEqual(r.merged, remote);
  assert.equal(r.toRemote, false);
  assert.equal(r.kept.length, 0);
  assert.deepEqual(Object.keys(r.toLocal).sort(), ['nylaos_note_x', 'nylaos_tasks']);
});

test('only this device changed: kept, and pushed', () => {
  const base = { nylaos_tasks: J([task(1, 'a')]) };
  const local = { nylaos_tasks: J([task(1, 'a'), task(2, 'mine')]) };
  const r = merge(local, { ...base }, base);
  assert.deepEqual(r.merged, local); assert.deepEqual(r.toLocal, {}); assert.equal(r.toRemote, true);
});

test('each device changed a different record: both survive', () => {
  const base = { nylaos_tasks: J([task(1, 'a'), task(2, 'b')]) };
  const local = { nylaos_tasks: J([task(1, 'a', { done: true }), task(2, 'b')]) };
  const remote = { nylaos_tasks: J([task(1, 'a'), task(2, 'b renamed')]) };
  const m = P(merge(local, remote, base).merged.nylaos_tasks);
  assert.equal(m[0].done, true); assert.equal(m[1].text, 'b renamed');
});

test('each device added a record: both are there, none twice', () => {
  const base = { nylaos_tasks: J([task(1, 'a')]) };
  const local = { nylaos_tasks: J([task(1, 'a'), task(2, 'laptop')]) };
  const remote = { nylaos_tasks: J([task(1, 'a'), task(3, 'phone')]) };
  const r = merge(local, remote, base);
  assert.deepEqual(P(r.merged.nylaos_tasks).map(t => t.id).sort(), [1, 2, 3]);
  assert.equal(r.kept.length, 0);
});

test('same record, different fields: merged field by field', () => {
  const base = { nylaos_tasks: J([task(1, 'a', { notes: '' })]) };
  const local = { nylaos_tasks: J([task(1, 'a', { notes: '', done: true })]) };
  const remote = { nylaos_tasks: J([task(1, 'a', { notes: 'call first' })]) };
  const r = merge(local, remote, base);
  assert.deepEqual(P(r.merged.nylaos_tasks)[0], task(1, 'a', { notes: 'call first', done: true }));
  assert.equal(r.kept.length, 0);
});

test('same field changed on both: the newer edit wins and the other is kept', () => {
  const page = (content, updated) => ({ id: 5, name: 'Plan', content, updated });
  const base = { nylaos_nb_pages: J([page('v0', '2026-09-01T10:00:00.000Z')]) };
  const local = { nylaos_nb_pages: J([page('laptop words', '2026-09-20T10:00:00.000Z')]) };
  const remote = { nylaos_nb_pages: J([page('phone words', '2026-09-21T10:00:00.000Z')]) };
  const r = merge(local, remote, base);
  assert.equal(P(r.merged.nylaos_nb_pages)[0].content, 'phone words');
  assert.equal(r.kept.length, 1);
  assert.equal(r.kept[0].from, 'this device');
  assert.equal(r.kept[0].value.content, 'laptop words');
  assert.equal(r.kept[0].recordId, '5');
});

test('deleted on the other device, untouched here: it goes', () => {
  const base = { nylaos_tasks: J([task(1, 'a'), task(2, 'b')]) };
  const r = merge({ ...base }, { nylaos_tasks: J([task(1, 'a')]) }, base);
  assert.deepEqual(P(r.merged.nylaos_tasks).map(t => t.id), [1]);
});

test('deleted here, edited there: the edit is kept, never lost', () => {
  const base = { nylaos_tasks: J([task(1, 'a'), task(2, 'b')]) };
  const local = { nylaos_tasks: J([task(1, 'a')]) };
  const remote = { nylaos_tasks: J([task(1, 'a'), task(2, 'b, with more')]) };
  const m = P(merge(local, remote, base).merged.nylaos_tasks);
  assert.deepEqual(m.map(t => t.text), ['a', 'b, with more']);
});

test('deleted here, untouched there: it stays deleted', () => {
  const base = { nylaos_tasks: J([task(1, 'a'), task(2, 'b')]) };
  const r = merge({ nylaos_tasks: J([task(1, 'a')]) }, { ...base }, base);
  assert.deepEqual(P(r.merged.nylaos_tasks).map(t => t.id), [1]);
  assert.equal(r.toRemote, true);
});

test('a long note edited on both: newer by key time wins, the other is kept', () => {
  const base = { nylaos_note_x: 'start' };
  const r = merge({ nylaos_note_x: 'laptop' }, { nylaos_note_x: 'phone' }, base, { localTimes: { nylaos_note_x: 200 }, remoteTimes: { nylaos_note_x: 100 } });
  assert.equal(r.merged.nylaos_note_x, 'laptop');
  assert.deepEqual(r.kept.map(k => [k.from, k.value]), [['other device', 'phone']]);
  const r2 = merge({ nylaos_note_x: 'laptop' }, { nylaos_note_x: 'phone' }, base, { localTimes: { nylaos_note_x: 100 }, remoteTimes: { nylaos_note_x: 200 } });
  assert.equal(r2.merged.nylaos_note_x, 'phone');
  assert.deepEqual(r2.kept.map(k => [k.from, k.value]), [['this device', 'laptop']]);
});

test('maps keyed by date merge key by key', () => {
  const base = { nylaos_weekly_reviews: J({ '2026-09-14': { wins: 'a' } }) };
  const local = { nylaos_weekly_reviews: J({ '2026-09-14': { wins: 'a' }, '2026-09-21': { wins: 'laptop' } }) };
  const remote = { nylaos_weekly_reviews: J({ '2026-09-14': { wins: 'a', hard: 'x' }, '2026-09-28': { wins: 'phone' } }) };
  const m = P(merge(local, remote, base).merged.nylaos_weekly_reviews);
  assert.deepEqual(Object.keys(m).sort(), ['2026-09-14', '2026-09-21', '2026-09-28']);
  assert.equal(m['2026-09-14'].hard, 'x');
});

test('a key removed on the other device, untouched here, is removed here', () => {
  const base = { nylaos_top3_x: J(['a']), nylaos_tasks: J([]) };
  const r = merge({ ...base }, { nylaos_tasks: J([]) }, base);
  assert.ok('nylaos_top3_x' in r.toLocal); assert.equal(r.toLocal.nylaos_top3_x, undefined);
  assert.ok(!('nylaos_top3_x' in r.merged));
});

test('a key removed there but changed here is kept', () => {
  const base = { nylaos_note_x: 'a' };
  const r = merge({ nylaos_note_x: 'a plus more' }, {}, base);
  assert.equal(r.merged.nylaos_note_x, 'a plus more'); assert.equal(r.toRemote, true);
});

test('device-only keys and other apps\' keys are never merged', () => {
  const r = merge({ nylaos_dirty_flag: 'true', nylaos_auto_bak: 'big', nylaos_moodboard: 'pins', nylaos_cloud_ts: '5', veluera_biz_v1: 'x', nylaos_tasks: '[]' },
                  { nylaos_dirty_flag: 'false', nylaos_tasks: '[]' }, null);
  assert.deepEqual(Object.keys(r.merged), ['nylaos_tasks']);
  assert.deepEqual(r.toLocal, {}); assert.equal(r.toRemote, false);
});

test('no base: everything on either side is kept', () => {
  const local = { nylaos_nb_pages: J([{ id: 1, name: 'Only on laptop', content: 'x', updated: '2026-09-01T00:00:00Z' }]) };
  const remote = { nylaos_nb_pages: J([{ id: 2, name: 'Only on phone', content: 'y', updated: '2026-09-02T00:00:00Z' }]), nylaos_ideas: J([{ id: 7, title: 'idea' }]) };
  const r = merge(local, remote, null);
  assert.deepEqual(P(r.merged.nylaos_nb_pages).map(p => p.id).sort(), [1, 2]);
  assert.ok(r.merged.nylaos_ideas); assert.equal(r.toRemote, true);
});

test('no base, same page differs: the later edit wins, the earlier is kept', () => {
  const local = { nylaos_nb_pages: J([{ id: 1, name: 'Plan', content: 'stale laptop copy', updated: '2026-09-10T00:00:00Z' }]) };
  const remote = { nylaos_nb_pages: J([{ id: 1, name: 'Plan', content: 'fresh from phone', updated: '2026-09-25T00:00:00Z' }]) };
  const r = merge(local, remote, null);
  assert.equal(P(r.merged.nylaos_nb_pages)[0].content, 'fresh from phone');
  assert.equal(r.kept[0].value.content, 'stale laptop copy');
  const back = merge(remote, local, null);
  assert.equal(P(back.merged.nylaos_nb_pages)[0].content, 'fresh from phone', 'the same answer from the other device');
});

test('no base, record with no edit time differs: the device that saved last wins, the other is kept', () => {
  const r = merge({ nylaos_tasks: J([task(1, 'a')]) }, { nylaos_tasks: J([task(1, 'a', { done: true })]) }, null);
  assert.equal(P(r.merged.nylaos_tasks)[0].done, true);
  assert.equal(r.kept.length, 1); assert.equal(r.kept[0].from, 'this device');
});

test('no base: a record in Recently Deleted on either device stays deleted', () => {
  const trash = J([{ id: 99, type: 'task', name: 'b', storageKey: 'nylaos_tasks', data: task(2, 'b'), deletedAt: '2026-09-20T00:00:00Z' }]);
  const local = { nylaos_tasks: J([task(1, 'a'), task(2, 'b')]) };
  const remote = { nylaos_tasks: J([task(1, 'a')]), nylaos_trash: trash };
  const r = merge(local, remote, null);
  assert.deepEqual(P(r.merged.nylaos_tasks).map(t => t.id), [1]);
  assert.equal(P(r.merged.nylaos_trash).length, 1);
});

test('no base: deleted, then written again later, is not deleted a second time', () => {
  const trash = J([{ id: 99, storageKey: 'nylaos_nb_pages', data: { id: 2 }, deletedAt: '2026-09-20T00:00:00Z' }]);
  const local = { nylaos_nb_pages: J([{ id: 2, name: 'Back', content: 'restored and edited', updated: '2026-09-22T00:00:00Z' }]) };
  const r = merge(local, { nylaos_nb_pages: J([]), nylaos_trash: trash }, null);
  assert.equal(P(r.merged.nylaos_nb_pages).length, 1);
});

test('broken JSON on one side is treated as text: newer wins, other kept, no crash', () => {
  const r = merge({ nylaos_tasks: '[{"id":1' }, { nylaos_tasks: J([task(1, 'a')]) }, { nylaos_tasks: '[]' });
  assert.ok(typeof r.merged.nylaos_tasks === 'string'); assert.equal(r.kept.length, 1);
});

test('lists inside a record (a person\'s log) merge too', () => {
  const person = log => ({ id: 1, name: 'Maya', log });
  const base = { nylaos_people: J([person([{ id: 'a', text: 'call' }])]) };
  const local = { nylaos_people: J([person([{ id: 'a', text: 'call' }, { id: 'b', text: 'coffee' }])]) };
  const remote = { nylaos_people: J([person([{ id: 'a', text: 'call' }, { id: 'c', text: 'text' }])]) };
  const r = merge(local, remote, base);
  assert.deepEqual(P(r.merged.nylaos_people)[0].log.map(x => x.id).sort(), ['a', 'b', 'c']);
  assert.equal(r.kept.length, 0);
});

test('a list with the same id twice does not double up', () => {
  const r = merge({ nylaos_tasks: J([task(1, 'a'), task(1, 'a')]) }, { nylaos_tasks: J([task(1, 'a'), task(2, 'b')]) }, { nylaos_tasks: J([task(1, 'a')]) });
  assert.deepEqual(P(r.merged.nylaos_tasks).map(t => t.id), [1, 2]);
});

test('fields rewritten in another order count as unchanged', () => {
  const base = { nylaos_tasks: '[{"id":1,"text":"a","done":false}]' };
  const local = { nylaos_tasks: '[{"done":false,"id":1,"text":"a"}]' };
  const remote = { nylaos_tasks: '[{"id":1,"text":"a","done":true}]' };
  const r = merge(local, remote, base);
  assert.equal(P(r.merged.nylaos_tasks)[0].done, true); assert.equal(r.kept.length, 0);
});

test('two devices end up identical after each has merged', () => {
  const base = { nylaos_tasks: J([task(1, 'a'), task(2, 'b')]), nylaos_note_x: 'n' };
  const A = { nylaos_tasks: J([task(1, 'a', { done: true }), task(2, 'b'), task(3, 'from A')]), nylaos_note_x: 'n' };
  const B = { nylaos_tasks: J([task(2, 'b edited'), task(4, 'from B')]), nylaos_note_x: 'n changed on B' };
  // A saved first, so the cloud holds A. B merges and pushes. A then merges B's push.
  const atB = merge(B, A, base);
  const atA = merge(A, atB.merged, A);
  assert.deepEqual(atA.merged, atB.merged);
  const ids = P(atB.merged.nylaos_tasks).map(t => t.id).sort();
  assert.deepEqual(ids, [1, 2, 3, 4], 'B deleted 1 but A had ticked it, and a change outlives a delete');
});

test('deleted on one device, ticked on the other: the ticked task survives', () => {
  const base = { nylaos_tasks: J([task(1, 'a')]) };
  const r = merge({ nylaos_tasks: J([]) }, { nylaos_tasks: J([task(1, 'a', { done: true })]) }, base);
  assert.equal(P(r.merged.nylaos_tasks).length, 1);
});

test('her stuck laptop: no base, an old copy here, newer work on the phone, nothing lost', () => {
  const local = {
    nylaos_nb_pages: J([{ id: 1, name: 'Journal', content: 'old', updated: '2026-09-20T00:00:00Z' }, { id: 3, name: 'Laptop only', content: 'keep me', updated: '2026-09-26T00:00:00Z' }]),
    nylaos_ideas: J([{ id: 10, title: 'x', created: '2026-09-01T00:00:00Z' }]),
    nylaos_dirty_flag: 'true', nylaos_auto_bak: 'huge',
  };
  const remote = {
    nylaos_nb_pages: J([{ id: 1, name: 'Journal', content: 'newer', updated: '2026-09-28T00:00:00Z' }, { id: 2, name: 'Phone only', content: 'and me', updated: '2026-09-27T00:00:00Z' }]),
    nylaos_ideas: J([{ id: 10, title: 'x', created: '2026-09-01T00:00:00Z' }, { id: 11, title: 'y', created: '2026-09-27T00:00:00Z' }]),
  };
  const r = merge(local, remote, null);
  const pages = P(r.merged.nylaos_nb_pages);
  assert.deepEqual(pages.map(p => p.id).sort(), [1, 2, 3]);
  assert.equal(pages.find(p => p.id === 1).content, 'newer');
  assert.equal(P(r.merged.nylaos_ideas).length, 2);
  assert.equal(r.kept.length, 1, 'the older Journal is kept, not thrown away');
  assert.ok(!('nylaos_auto_bak' in r.merged));
});
