import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync('public/app-bootstrap.js', 'utf8');

function scenario({ standalone = false, dismiss = false } = {}) {
  const listeners = new Map();
  const elements = [];
  const session = new Map();
  const registered = [];
  const makeElement = () => ({
    style: {},
    children: [],
    listeners: {},
    setAttribute() {},
    append(...nodes) { this.children.push(...nodes); },
    addEventListener(name, fn) { this.listeners[name] = fn; },
    remove() { const index = elements.indexOf(this); if (index >= 0) elements.splice(index, 1); },
  });
  const document = {
    readyState: 'complete',
    body: { appendChild(el) { elements.push(el); } },
    createElement: makeElement,
    getElementById() { return null; },
  };
  const window = {
    navigator: {},
    addEventListener(name, fn) { listeners.set(name, fn); },
    matchMedia() { return { matches: standalone, addEventListener() {} }; },
    setTimeout() {},
    location: { reload() {} },
  };
  const context = {
    window, document, navigator: { serviceWorker: { register(url) { registered.push(url); return Promise.resolve(); } } },
    localStorage: { getItem() { return 'ka'; } },
    sessionStorage: {
      getItem(key) { return session.get(key) || null; },
      setItem(key, value) { session.set(key, value); },
    },
    console,
  };
  runInNewContext(source, context, { timeout: 2000 });
  assert.deepEqual(registered, ['/sw.js']);
  const event = {
    prevented: false,
    preventDefault() { this.prevented = true; },
    promptCalls: 0,
    prompt() { this.promptCalls++; return Promise.resolve(); },
    userChoice: Promise.resolve({ outcome: 'accepted' }),
  };
  listeners.get('beforeinstallprompt')(event);
  if (standalone) {
    assert.equal(elements.length, 0);
    assert.equal(event.prevented, false);
  } else {
    assert.equal(event.prevented, true);
    assert.equal(elements.length, 1);
    assert.equal(elements[0].children.length, 2);
    if (dismiss) {
      elements[0].children[1].listeners.click();
      assert.equal(elements.length, 0);
      listeners.get('beforeinstallprompt')(event);
      assert.equal(elements.length, 0);
    }
  }
  return { listeners, elements, event };
}

scenario({ standalone: true });
scenario({ dismiss: true });
const normal = scenario();
await normal.elements[0].children[0].listeners.click();
assert.equal(normal.event.promptCalls, 1);
assert.equal(normal.elements.length, 0);
normal.listeners.get('appinstalled')();
assert.equal(normal.elements.length, 0);
console.log('PWA interaction checks passed: eligibility, dismissal, install click, installed state.');
