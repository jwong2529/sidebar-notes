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