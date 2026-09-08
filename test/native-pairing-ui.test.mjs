import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { buildPair, EXAMPLES } from "../web/connect/pairing.mjs";

// State-machine regressions using the actual page controller. This small DOM
// stub does not prove browser clipboard permissions, navigation or rendering.
const controller = readFileSync(new URL("../web/connect/app.mjs", import.meta.url), "utf8")
  .replace(/^import[^\n]+\n/, "");
const taskA = "codex://threads/11111111-1111-4111-8111-111111111111";
const taskB = "codex://threads/abcdefab-abcd-4bcd-8bcd-abcdefabcdef";

function element(id = "") {
  const classes = new Set();
  return {
    id, value: "", checked: false, disabled: false, hidden: false, textContent: "", dataset: {},
    listeners: new Map(), selected: false, focused: false,
    classList: { add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value) },
    addEventListener(type, listener) {
      this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
    },
    dispatch(type, event = {}) {
      return Promise.all((this.listeners.get(type) ?? []).map(listener => listener({ target: this, ...event })));
    },
    removeAttribute(name) { delete this[name]; },
    setAttribute(name, value) { this[name] = value; },
    replaceChildren(...children) { this.children = children; },
    focus() { this.focused = true; },
    select() { this.selected = true; },
    scrollIntoView() {},
  };
}

function page() {
  const nodes = new Map();
  const get = id => nodes.get(id) ?? nodes.set(id, element(id)).get(id);
  const form = get("pair-form");
  const mode = element();
  const clipboardWrites = [];
  form.querySelector = () => mode;
  form.reset = () => {
    for (const id of ["task-a", "task-b", "topic"]) get(id).value = "";
    get("consent").checked = false;
    mode.value = "automatic";
  };
  const context = {
    buildPair, EXAMPLES,
    navigator: { language: "en", clipboard: {
      writeText(text) {
        let resolve, reject;
        const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
        clipboardWrites.push({ text, resolve, reject });
        return promise;
      },
    } },
    window: element(),
    document: {
      getElementById: get, documentElement: {},
      querySelectorAll: () => [], querySelector: () => element(), createElement: () => element(),
    },
  };
  vm.runInNewContext(controller, context, { filename: "web/connect/app.mjs" });
  const change = async (id, value) => {
    if (id === "mode") mode.value = value;
    else if (id === "consent") get(id).checked = value;
    else get(id).value = value;
    await form.dispatch("input");
  };
  const submit = async () => {
    let prevented = false;
    await form.dispatch("submit", { preventDefault() { prevented = true; } });
    assert.ok(prevented, "the controller must prevent default form submission");
  };
  const click = id => get(id).disabled ? Promise.resolve() : get(id).dispatch("click");
  const prepare = async () => {
    await change("task-a", taskA); await change("task-b", taskB);
    await change("topic", "Approved product terms"); await change("consent", true);
    await submit();
    assert.equal(get("results").hidden, false);
  };
  return { get, change, submit, click, prepare, clipboardWrites };
}

test("a pending copy blocks regeneration and parallel copies, then restores controls", async () => {
  const ui = page(); await ui.prepare();
  const copying = ui.click("copy-a");
  assert.equal(ui.clipboardWrites.length, 1);
  assert.equal(ui.get("generate").disabled, true);
  assert.equal(ui.get("copy-a").disabled, true);
  assert.equal(ui.get("copy-b").disabled, true);
  await ui.submit();
  await ui.click("copy-b");
  assert.equal(ui.clipboardWrites.length, 1, "only one clipboard write may be pending");
  ui.clipboardWrites[0].resolve(); await copying;
  assert.equal(ui.get("generate").disabled, false);
  assert.equal(ui.get("copy-a").disabled, false);
  assert.equal(ui.get("copy-b").disabled, false);
  assert.match(ui.get("copy-status-a").textContent, /Copied/);
});

test("changing inputs during a pending copy clears old outputs without reopening the copy race", async () => {
  const ui = page(); await ui.prepare();
  const copying = ui.click("copy-a");
  await ui.change("topic", "Only free-plan project counts");
  assert.equal(ui.get("results").hidden, true);
  for (const side of ["a", "b"]) {
    assert.equal(ui.get(`prompt-${side}`).value, "");
    assert.equal(ui.get(`open-${side}`).href, undefined);
  }
  await ui.submit(); await ui.click("copy-b");
  assert.equal(ui.clipboardWrites.length, 1);
  assert.equal(ui.get("results").hidden, true, "pending copy must not permit a replacement generation");
  ui.clipboardWrites[0].resolve(); await copying;
  assert.doesNotMatch(ui.get("copy-status-a").textContent, /Copied/);
  assert.match(ui.get("field-error").textContent, /clipboard/i, "an uncancellable old write must not be silently treated as current");
  assert.equal(ui.get("generate").disabled, false);
  await ui.submit();
  assert.match(ui.get("prompt-a").value, /Only free-plan project counts/);
  const newCopy = ui.click("copy-b");
  assert.equal(ui.clipboardWrites.length, 2);
  assert.match(ui.clipboardWrites[1].text, /Only free-plan project counts/);
  ui.clipboardWrites[1].resolve(); await newCopy;
  assert.equal(ui.get("field-error").textContent, "");
});

test("clipboard failure reports a manual-copy fallback rather than success", async () => {
  const ui = page(); await ui.prepare();
  const copying = ui.click("copy-a");
  ui.clipboardWrites[0].reject(new Error("clipboard permission denied")); await copying;
  assert.match(ui.get("copy-status-a").textContent, /Clipboard unavailable/);
  assert.doesNotMatch(ui.get("copy-status-a").textContent, /Copied/);
  assert.equal(ui.get("copy-status-a").classList.contains("error"), true);
  assert.equal(ui.get("prompt-a").focused, true);
  assert.equal(ui.get("prompt-a").selected, true);
  assert.equal(ui.get("generate").disabled, false);
  assert.equal(ui.get("copy-a").disabled, false);
});

test("mode and consent changes remove old links and cannot leave automatic prompts visible", async () => {
  const ui = page(); await ui.prepare();
  assert.match(ui.get("prompt-a").value, /I authorize automatic/);
  await ui.change("mode", "review");
  assert.equal(ui.get("results").hidden, true);
  assert.equal(ui.get("prompt-a").value, "");
  assert.equal(ui.get("open-a").href, undefined);
  await ui.submit();
  assert.match(ui.get("prompt-a").value, /draft in this task/);
  assert.doesNotMatch(ui.get("prompt-a").value, /I authorize automatic/);
  await ui.change("consent", false);
  await ui.submit();
  assert.equal(ui.get("results").hidden, true);
  assert.equal(ui.get("generate").disabled, true);
  assert.equal(ui.get("open-b").href, undefined);
});
