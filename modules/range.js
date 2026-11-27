import { dom } from "./dom.js";

export function getEditorRangeAtPoint(x, y) {
  if (document.caretRangeFromPoint) {
    return document.caretRangeFromPoint(x, y);
  }
  if (document.caretPositionFromPoint) {
    const position = document.caretPositionFromPoint(x, y);
    if (!position) {
      return null;
    }
    const range = document.createRange();
    range.setStart(position.offsetNode, position.offset);
    range.collapse(true);
    return range;
  }
  return null;
}

export function getEditorRange() {
  const selection = window.getSelection();
  if (selection.rangeCount > 0 && dom.noteArea.contains(selection.anchorNode)) {
    return selection.getRangeAt(0).cloneRange();
  }
  const range = document.createRange();
  range.selectNodeContents(dom.noteArea);
  range.collapse(false);
  return range;
}

export function getSelectionElement(node) {
  return node ? (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement) : null;
}

export function getTopBlock(node, root = dom.noteArea) {
  if (!node || !root.contains(node) || node === root) return null;
  let current = node;
  while (current.parentElement && current.parentElement !== root) {
    current = current.parentElement;
  }
  return current;
}

export function setCaretToStart(element) {
  dom.noteArea.focus();
  const selection = window.getSelection();
  const range = document.createRange();
  if (element.firstChild && element.firstChild.nodeType === Node.TEXT_NODE) {
    range.setStart(element.firstChild, 0);
  } else {
    range.setStart(element, 0);
  }
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

export function setCaretAfterOffset(node, offset) {
  dom.noteArea.focus();
  const selection = window.getSelection();
  const range = document.createRange();
  range.setStart(node, Math.min(offset, node.length));
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

export function collapseSelection(node, offset = 0) {
  dom.noteArea.focus();
  window.getSelection().collapse(node, offset);
}

export function isEmptyBlock(element, { ignoreBreaks = false } = {}) {
  if (!element) return true;
  if (element.textContent.length > 0) return false;
  const selector = ignoreBreaks ? "img, video, audio" : "br, img, video, audio";
  return !element.querySelector?.(selector);
}