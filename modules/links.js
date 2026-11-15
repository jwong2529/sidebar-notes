import { dom } from "./dom.js";
import { editBlocks } from "./editor-history.js";

export function urlMatches(text) {
  return Array.from(text.matchAll(/(?:https?:\/\/|www\.)[^\s<>"']+/gi)).flatMap((match) => {
    if (match.index && /[\w@/]/.test(text[match.index - 1])) return [];
    let value = match[0].replace(/[.,!?;:]+$/, "");
    for (const [open, close] of [["(", ")"], ["[", "]"], ["{", "}"]]) {
      while (value.endsWith(close) && value.split(close).length > value.split(open).length) value = value.slice(0, -1);
    }
    try {
      const url = new URL(/^www\./i.test(value) ? `https://${value}` : value);
      if (!url.hostname || url.username || url.password) return [];
      return [{ start: match.index, end: match.index + value.length, text: value, href: url.href }];
    } catch { return []; }
  });
}

function preserveSelection(change) {
  const selection = window.getSelection();
  if (!selection.rangeCount || !dom.noteArea.contains(selection.anchorNode)) return change();
  const points = [selection.anchorNode, selection.focusNode].map((node, index) => {
    const range = document.createRange();
    range.setStart(node, index ? selection.focusOffset : selection.anchorOffset);
    range.collapse(true);
    return range;
  });
  change(points);
  selection.setBaseAndExtent(points[0].startContainer, points[0].startOffset, points[1].startContainer, points[1].startOffset);
}

export function linkify(root = dom.noteArea, complete = false) {
  preserveSelection((points = []) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) {
      if (!walker.currentNode.parentElement.closest('a, code, pre, [contenteditable="false"]')) nodes.push(walker.currentNode);
    }
    for (const node of nodes) {
      const matches = urlMatches(node.data).filter(match => complete || match.end < node.length && /\s/.test(node.data.slice(match.end)));
      if (!matches.length) continue;
      const offsets = points.map(point => point.startContainer === node ? point.startOffset : null);
      const pieces = [];
      const fragment = document.createDocumentFragment();
      let offset = 0;
      for (const match of matches) {
        const before = document.createTextNode(node.data.slice(offset, match.start));
        fragment.append(before);
        pieces.push({node: before, start: offset, end: match.start});
        const link = document.createElement('a');
        link.href = match.href;
        link.dataset.autoLink = 'true';
        link.textContent = match.text;
        fragment.append(link);
        pieces.push({node: link.firstChild, start: match.start, end: match.end});
        offset = match.end;
      }
      const tail = document.createTextNode(node.data.slice(offset));
      fragment.append(tail);
      pieces.push({node: tail, start: offset, end: node.length});
      node.replaceWith(fragment);
      offsets.forEach((position, index) => {
        if (position === null) return;
        const piece = pieces.find(part => position >= part.start && position < part.end) || pieces[pieces.length - 1];
        points[index].setStart(piece.node, position - piece.start);
        points[index].collapse(true);
      });
    }
  });
}

export function initLinks() {
  dom.noteArea.addEventListener('beforeinput', (event) => {
    if (event.isComposing || event.inputType !== 'insertText' || !/^\s/.test(event.data || '')) return;
    const selection = window.getSelection();
    if (!selection.isCollapsed || !selection.rangeCount) return;
    const element = selection.anchorNode.nodeType === Node.ELEMENT_NODE ? selection.anchorNode : selection.anchorNode.parentElement;
    const link = element.closest('a');
    if (!link) return;
    const tail = document.createRange();
    tail.selectNodeContents(link);
    tail.setStart(selection.anchorNode, selection.anchorOffset);
    if (tail.toString()) return;
    const text = document.createTextNode('');
    link.after(text);
    selection.collapse(text, 0);
  });
  dom.noteArea.addEventListener('input', (event) => {
    if (event.isComposing || event.inputType?.startsWith('history')) return;
    dom.noteArea.querySelectorAll('a[data-auto-link]').forEach(link => {
      const matches = urlMatches(link.textContent);
      if (matches.length === 1 && matches[0].text === link.textContent) link.href = matches[0].href;
      else {
        const selection = window.getSelection();
        const anchor = selection.anchorNode;
        const focus = selection.focusNode;
        const anchorOffset = selection.anchorOffset;
        const focusOffset = selection.focusOffset;
        link.replaceWith(...link.childNodes);
        if (anchor?.isConnected && focus?.isConnected) selection.setBaseAndExtent(anchor, anchorOffset, focus, focusOffset);
      }
    });
    if (event.inputType === 'insertFromPaste' || event.inputType === 'insertParagraph' || /\s/.test(event.data || '')) linkify(dom.noteArea, event.inputType !== 'insertText');
  }, true);
  dom.noteArea.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return;
    const selection = window.getSelection();
    if (!selection.isCollapsed) return;
    const element = selection.anchorNode?.nodeType === Node.ELEMENT_NODE ? selection.anchorNode : selection.anchorNode?.parentElement;
    const block = element?.closest('[data-list-content], p, div, h1, h2');
    if (block && dom.noteArea.contains(block)) editBlocks(() => linkify(block, true));
  });
  dom.noteArea.addEventListener('paste', (event) => {
    const text = event.clipboardData.getData('text/plain');
    const matches = urlMatches(text.trim());
    const selection = window.getSelection();
    if (!selection.rangeCount || !matches.length) return;
    const single = matches.length === 1 && matches[0].text === text.trim();
    if (single && !selection.isCollapsed) {
      event.preventDefault();
      event.stopImmediatePropagation();
      editBlocks(() => document.execCommand('createLink', false, matches[0].href));
    } else if (!event.clipboardData.getData('text/html')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      editBlocks(() => {
        document.execCommand('insertText', false, text);
        linkify(dom.noteArea, true);
      });
    }
  }, true);
  dom.noteArea.addEventListener('click', (event) => {
    const link = event.target.closest('a[href]');
    if (!link || !dom.noteArea.contains(link) || !window.getSelection().isCollapsed || event.shiftKey || event.altKey) return;
    if (!/^https?:\/\//i.test(link.href)) return;
    event.preventDefault();
    window.open(link.href, '_blank', 'noopener,noreferrer');
  });
}
