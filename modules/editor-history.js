import { dom } from "./dom.js";
import { triggerSave } from "./storage.js";

let entries = [];
let index = -1;
let restoring = false;
let transactionDepth = 0;

function snapshot() {
  const selection = window.getSelection();
  const point = (node, offset) => {
    if (!node || !dom.noteArea.contains(node)) return null;
    const path = [];
    while (node !== dom.noteArea) {
      path.unshift(Array.prototype.indexOf.call(node.parentNode.childNodes, node));
      node = node.parentNode;
    }
    return { path, offset };
  };
  return { html: dom.noteArea.innerHTML, anchor: point(selection.anchorNode, selection.anchorOffset), focus: point(selection.focusNode, selection.focusOffset) };
}

export function resetEditorHistory() {
  entries = [snapshot()];
  index = 0;
}

export function recordEditorState() {
  if (restoring || transactionDepth) return;
  const entry = snapshot();
  if (entries[index]?.html === entry.html) entries[index] = entry;
  else {
    entries.splice(index + 1);
    entries.push(entry);
    if (entries.length > 100) entries.shift();
    index = entries.length - 1;
  }
}

export function editBlocks(change) {
  recordEditorState();
  transactionDepth += 1;
  try { change(); } finally { transactionDepth -= 1; }
  recordEditorState();
  triggerSave();
}

export function restoreEditorHistory(direction) {
  const next = index + direction;
  if (next < 0 || next >= entries.length) return;
  restoring = true;
  index = next;
  const entry = entries[index];
  dom.noteArea.innerHTML = entry.html;
  dom.noteArea.focus();
  const resolve = (point) => point.path.reduce((node, part) => node.childNodes[part], dom.noteArea);
  if (entry.anchor && entry.focus) window.getSelection().setBaseAndExtent(resolve(entry.anchor), entry.anchor.offset, resolve(entry.focus), entry.focus.offset);
  restoring = false;
  triggerSave();
}

export function initEditorHistory() {
  dom.noteArea.addEventListener("beforeinput", (event) => {
    if (event.inputType === "historyUndo" || event.inputType === "historyRedo") {
      event.preventDefault();
      restoreEditorHistory(event.inputType === "historyUndo" ? -1 : 1);
    } else recordEditorState();
  });
  dom.noteArea.addEventListener("input", recordEditorState);
  dom.noteArea.addEventListener("keydown", (event) => {
    if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key !== "z" && key !== "y") return;
    event.preventDefault();
    restoreEditorHistory(key === "y" || event.shiftKey ? 1 : -1);
  });
}
