import { platforms, calendarEntries } from '../public/schedules.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

class Element {
  constructor() {
    this.children = [];
    this.style = { setProperty() {} };
    this.classList = { add() {} };
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute() {}
  addEventListener(name, callback) { this[name] = callback; }
  showModal() { this.open = true; }
  querySelector() { return null; }
}

async function calendar(posts) {
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  let source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  source = source.replaceAll('\r', '');
  source = source.replace(/^import .*;\n/gm, '');
  source = source.slice(0, source.lastIndexOf('\nrenderCalendar();'));
  const context = vm.createContext({
    document: { getElementById: get, createElement: () => new Element(), addEventListener() {} },
    window: { addEventListener() {} }, Date, Intl, setTimeout, clearTimeout, inputPosts: posts, platforms, calendarEntries,
  });
  vm.runInContext(source + `
    brands = [{ id: 'test', name: 'Example' }];
    activeBrandId = 'test';
    focusDate = new Date(2026, 10, 13);
    posts = inputPosts;
    renderWeek(); renderMonth();
  `, context);
  return { get, context };
}
const descendants = element => [element, ...element.children.flatMap(descendants)];
const post = (id, time = '12:00', brandId = 'test') => ({ id, brandId, title: `YouTube title ${id}`, date: '2026-11-13', time });

test('month shows two videos and an accurate overflow count', async () => {
  const { get } = await calendar(Array.from({ length: 6 }, (_, i) => post(String(i))));
  const nodes = descendants(get('calendar-grid'));
  assert.equal(nodes.filter(node => node.className === 'post-card').length, 2);
  assert.ok(nodes.some(node => node.textContent === '+4 more'));
});

test('a single video uses its YouTube title', async () => {
  const { get } = await calendar([post('one')]);
  assert.ok(descendants(get('week-grid')).some(node => node.textContent === 'YouTube title one'));
});

test('overlapping videos are grouped and other brands stay hidden', async () => {
  const { get } = await calendar([post('one'), post('two'), post('private', '12:00', 'other')]);
  const nodes = descendants(get('week-grid'));
  assert.ok(nodes.some(node => node.textContent === '2 videos'));
  assert.ok(!nodes.some(node => node.textContent === 'YouTube title private'));
});

test('the day view includes all videos in time order and honest draft status', async () => {
  const { get, context } = await calendar([post('late', '18:00'), post('early', '09:00')]);
  vm.runInContext("openDayPosts('2026-11-13')", context);
  assert.equal(get('day-posts').open, true);
  assert.equal(get('day-posts-list').children.length, 2);
  const nodes = descendants(get('day-posts-list'));
  assert.ok(nodes.some(node => node.textContent === 'Draft · Not scheduled on any platform'));
  assert.equal(get('day-posts-list').children[0].children[1].children[0].textContent, 'YouTube title early');
});
