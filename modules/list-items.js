import { dom } from "./dom.js";
import { editBlocks } from "./editor-history.js";
import { getEditorRange, getSelectionElement, collapseSelection } from "./range.js";
import { initListClipboard } from "./list-clipboard.js";
import {
  LIST_ITEM_REGISTRY,
  LIST_ITEM_ATTRS,
  LIST_ITEM_SELECTOR,
  LIST_PREFIX_SELECTOR,
  getListItemType,
  listItemAtSelection,
  bulletMarker,
  createListItemElement,
  createListItemMarkup,
  stripListPrefixes,
  clearListItemAttributes,
  rowContent,
  emptyContent,
  ensureContent,
  selectionBlock,
  renumberLists,
  normalizeListRows,
  changeDepth
} from "./list-model.js";

export {
  LIST_ITEM_REGISTRY,
  LIST_ITEM_ATTRS,
  LIST_ITEM_SELECTOR,
  LIST_PREFIX_SELECTOR,
  getListItemType,
  listItemAtSelection,
  bulletMarker,
  createListItemElement,
  createListItemMarkup,
  stripListPrefixes,
  clearListItemAttributes,
  rowContent,
  renumberLists,
  normalizeListRows,
  changeDepth
};

export function toggleListItem(type) {
  dom.noteArea.focus();
  const selectedRange = getEditorRange();
  if (selectedRange.collapsed && listItemAtSelection()) {
    selectedRange.selectNodeContents(listItemAtSelection());
    if (convertSelectionToListItems(selectedRange, type)) return;
  }
  if (!selectedRange.collapsed && convertSelectionToListItems(selectedRange, type)) return;
  const row = createListItemElement("", 0, false, type);
  const range = getEditorRange();
  const node = getSelectionElement(range.startContainer);
  const block = node.closest("div, p, h1, h2, li");
  if (range.collapsed && block && block !== dom.noteArea && dom.noteArea.contains(block) && !block.querySelector("div, p, li, " + LIST_ITEM_SELECTOR)) {
    const content = block.cloneNode(true);
    stripListPrefixes(content);
    row.lastChild.remove();
    row.append(...content.childNodes);
    if (row.childNodes.length === 1) row.append(document.createElement("br"));
    range.selectNode(block);
  }
  insertListItemEdit(range, [row], 0, 1);
}

export function convertSelectionToListItems(range, type = "todo") {
  if (!dom.noteArea.contains(range.startContainer) || !dom.noteArea.contains(range.endContainer)) return false;
  const blockSelector = "div, p, h1, h2, h3, h4, h5, h6, ul, ol, li, blockquote, pre";
  const groups = [];
  const compare = (leftNode, leftOffset, rightNode, rightOffset) => {
    const normalize = (node, offset) => {
      while (node !== dom.noteArea) {
        const length = node.nodeType === Node.TEXT_NODE ? node.length : node.childNodes.length;
        if (offset !== 0 && offset !== length) break;
        const index = Array.prototype.indexOf.call(node.parentNode.childNodes, node);
        offset = index + (offset === 0 ? 0 : 1);
        node = node.parentNode;
      }
      return [node, offset];
    };
    [leftNode, leftOffset] = normalize(leftNode, leftOffset);
    [rightNode, rightOffset] = normalize(rightNode, rightOffset);
    const left = document.createRange();
    const right = document.createRange();
    left.setStart(leftNode, leftOffset);
    right.setStart(rightNode, rightOffset);
    left.collapse(true);
    right.collapse(true);
    return left.compareBoundaryPoints(Range.START_TO_START, right);
  };
  const touches = (row) => compare(range.startContainer, range.startOffset, row.endContainer, row.endOffset) < 0
    && compare(range.endContainer, range.endOffset, row.startContainer, row.startOffset) > 0;
  const collect = (container) => {
    const itemType = getListItemType(container);
    if (itemType) {
      const row = document.createRange();
      row.selectNodeContents(container);
      groups.push({ source: container, rows: [{ range: row, selected: touches(row) }], isList: true, type: itemType });
      return;
    }
    if (container.querySelector?.(blockSelector)) {
      for (const child of container.childNodes) {
        if (child.nodeType === Node.ELEMENT_NODE || (child.nodeType === Node.TEXT_NODE && child.textContent.replace(/\u200b/g, "").length)) collect(child);
      }
      return;
    }
    const rows = [];
    let startNode = container;
    let startOffset = 0;
    const add = (endNode, endOffset, nextNode, nextOffset) => {
      const row = document.createRange();
      row.setStart(startNode, startOffset);
      row.setEnd(endNode, endOffset);
      const hit = row.cloneRange();
      if (nextNode) hit.setEnd(nextNode, nextOffset);
      rows.push({ range: row, selected: touches(hit) });
      startNode = nextNode || endNode;
      startOffset = nextNode ? nextOffset : endOffset;
    };
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let node = container.nodeType === Node.TEXT_NODE ? container : walker.nextNode();
    while (node) {
      if (node.nodeName === "BR") {
        const index = Array.prototype.indexOf.call(node.parentNode.childNodes, node);
        add(node.parentNode, index, node.parentNode, index + 1);
      } else if (node.nodeType === Node.TEXT_NODE) {
        for (let offset = 0; offset < node.length; offset++) {
          if (node.data[offset] === "\n") add(node, offset, node, offset + 1);
        }
      }
      node = walker.nextNode();
    }
    const tail = document.createRange();
    tail.setStart(startNode, startOffset);
    tail.setEnd(container, container.nodeType === Node.TEXT_NODE ? container.length : container.childNodes.length);
    const fragment = tail.cloneContents();
    if (!rows.length || fragment.textContent.length || fragment.querySelector("img, input")) add(container, container.nodeType === Node.TEXT_NODE ? container.length : container.childNodes.length);
    groups.push({ source: container, rows, isList: false });
  };
  collect(dom.noteArea);
  const touched = groups.filter((group) => group.rows.some((row) => row.selected));
  if (!touched.length) return false;
  const remove = touched.every((group) => group.isList && group.type === type);
  const root = dom.noteArea.cloneNode(true);
  const copyOf = (node) => {
    const path = [];
    while (node !== dom.noteArea) {
      path.unshift(Array.prototype.indexOf.call(node.parentNode.childNodes, node));
      node = node.parentNode;
    }
    return path.reduce((copy, index) => copy.childNodes[index], root);
  };
  const changes = touched.map((group) => ({ group, copy: copyOf(group.source) }));
  for (const { group, copy } of changes) {
    if (group.isList) {
      if (remove || group.type !== type) {
        clearListItemAttributes(copy);
        if (!copy.hasChildNodes()) copy.append(document.createElement("br"));
        if (!remove) {
          const row = createListItemElement("", Number(group.source.dataset.depth) || 0, false, type);
          row.lastChild.remove();
          row.append(...copy.childNodes);
          copy.replaceWith(row);
        }
      }
      continue;
    }
    const rows = group.rows.map((row) => {
      const content = row.range.cloneContents();
      let element;
      if (row.selected) {
        element = createListItemElement("", 0, false, type);
        element.lastChild.remove();
      } else {
        element = document.createElement(group.source === dom.noteArea || !group.source.localName ? "div" : group.source.localName);
      }
      element.append(content);
      if (!content.textContent && !element.querySelector("img, br") && element.childNodes.length <= (row.selected ? 1 : 0)) element.append(document.createElement("br"));
      return element;
    });
    if (copy === root) root.replaceChildren(...rows);
    else copy.replaceWith(...rows);
  }
  for (const list of Array.from(root.querySelectorAll("ul, ol")).reverse()) {
    if (!Array.from(list.children).some((child) => child.matches(LIST_ITEM_SELECTOR))) continue;
    const parts = [];
    let remaining = list.cloneNode(false);
    for (const child of Array.from(list.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE && child.matches(LIST_ITEM_SELECTOR)) {
        if (remaining.hasChildNodes()) parts.push(remaining);
        parts.push(child);
        remaining = list.cloneNode(false);
      } else remaining.append(child);
    }
    if (remaining.hasChildNodes()) parts.push(remaining);
    list.replaceWith(...parts);
  }
  const top = (node) => {
    if (node === dom.noteArea) return node;
    while (node.parentNode !== dom.noteArea) node = node.parentNode;
    return node;
  };
  const first = top(touched[0].source);
  const last = top(touched[touched.length - 1].source);
  const replacement = document.createRange();
  if (first === dom.noteArea) replacement.selectNodeContents(dom.noteArea);
  else {
    replacement.setStartBefore(first);
    replacement.setEndAfter(last);
  }
  const start = first === dom.noteArea ? 0 : Array.prototype.indexOf.call(dom.noteArea.childNodes, first);
  const end = first === dom.noteArea ? dom.noteArea.childNodes.length : Array.prototype.indexOf.call(dom.noteArea.childNodes, last) + 1;
  const beforeCount = start;
  const afterCount = dom.noteArea.childNodes.length - end;
  const rows = Array.from(root.childNodes).slice(beforeCount, root.childNodes.length - afterCount);
  const elements = rows.map((node) => {
    if (node.nodeType === Node.ELEMENT_NODE) return node;
    const paragraph = document.createElement("div");
    paragraph.append(node);
    return paragraph;
  });
  insertListItemEdit(replacement, elements, 0, remove ? 0 : 1);
  return true;
}

export function insertListItemEdit(range, rows, caretRow, caretOffset) {
  editBlocks(() => {
    const marker = document.createTextNode("");
    rows[caretRow].insertBefore(marker, rows[caretRow].childNodes[caretOffset] || null);
    range.deleteContents();
    const fragment = document.createDocumentFragment();
    fragment.append(...rows);
    range.insertNode(fragment);
    normalizeListRows();
    const parent = marker.parentNode;
    const offset = Array.prototype.indexOf.call(parent.childNodes, marker);
    marker.remove();
    collapseSelection(parent, offset);
  });
}

function previousBlock(row) {
  let previous = row.previousSibling;
  while (previous?.nodeType === Node.TEXT_NODE && !previous.textContent.replace(/\u200b/g, "").length) previous = previous.previousSibling;
  return previous?.matches?.("div, p, h1, h2, h3, h4, h5, h6") ? previous : null;
}

export function handleParagraphBackspace(event) {
  if (event.key !== "Backspace" || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return false;
  const selection = window.getSelection();
  if (!selection.rangeCount || !selection.isCollapsed) return false;
  const range = selection.getRangeAt(0);
  const element = getSelectionElement(range.startContainer);
  const paragraph = element.closest("div, p, h1, h2");
  if (!paragraph || paragraph === dom.noteArea || paragraph.closest(LIST_ITEM_SELECTOR)) return false;
  const previous = previousBlock(paragraph);
  if (!previous) return false;
  const leading = range.cloneRange();
  leading.setStart(paragraph, 0);
  const fragment = leading.cloneContents();
  if (fragment.textContent.length || fragment.querySelector("br, img, video, audio")) return false;
  event.preventDefault();
  editBlocks(() => {
    const target = rowContent(previous);
    if (target.lastChild?.nodeName === "BR") target.lastChild.remove();
    const offset = target.childNodes.length;
    if (!emptyContent(paragraph)) target.append(...paragraph.childNodes);
    paragraph.remove();
    ensureContent(target);
    renumberLists(dom.noteArea);
    collapseSelection(target, offset);
  });
  return true;
}

function isBlockSelected(block, range) {
  if (!range.intersectsNode(block)) return false;
  if (block.contains(range.endContainer) && !block.contains(range.startContainer)) {
    const content = rowContent(block);
    const probe = document.createRange();
    probe.selectNodeContents(content);
    probe.collapse(true);
    if (range.compareBoundaryPoints(Range.START_TO_END, probe) <= 0) return false;
  }
  return true;
}

function getSelectedBlocks(range) {
  const blocks = [];
  for (const child of Array.from(dom.noteArea.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE && !child.textContent.trim()) continue;
    let block = child;
    if (block.nodeType !== Node.ELEMENT_NODE) {
      const wrapper = document.createElement("div");
      block.replaceWith(wrapper);
      wrapper.append(block);
      block = wrapper;
    }
    if (isBlockSelected(block, range)) {
      blocks.push(block);
    }
  }
  return blocks;
}

function exitList(item) {
  const isNumber = item.hasAttribute("data-number");
  const parent = item.parentElement || dom.noteArea;
  const content = rowContent(item);
  const paragraph = document.createElement("div");
  paragraph.append(...content.childNodes);
  ensureContent(paragraph);
  item.replaceWith(paragraph);
  if (isNumber) {
    renumberLists(parent);
  }
  collapseSelection(paragraph);
}

function deleteBlockSelection(range) {
  const first = selectionBlock(range.startContainer);
  const last = selectionBlock(range.endContainer);
  if (!first || !last || first === last || first.parentNode !== last.parentNode || first === dom.noteArea) return false;
  if (!getListItemType(first) && !getListItemType(last)) return false;
  editBlocks(() => {
    const start = rowContent(first);
    const end = rowContent(last);
    const head = document.createRange();
    head.selectNodeContents(start);
    head.setEnd(range.startContainer, range.startOffset);
    const tail = document.createRange();
    tail.selectNodeContents(end);
    tail.setStart(range.endContainer, range.endOffset);
    const leading = head.cloneContents();
    const trailing = tail.cloneContents();
    start.replaceChildren(leading);
    const offset = start.childNodes.length;
    start.append(trailing);
    let current = first.nextSibling;
    while (current) {
      const next = current.nextSibling;
      current.remove();
      if (current === last) break;
      current = next;
    }
    ensureContent(start);
    renumberLists(dom.noteArea);
    collapseSelection(start, offset);
  });
  return true;
}

export function handleListItemKey(event) {
  if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return false;
  if (!["Enter", "Tab", "Backspace", "Delete"].includes(event.key)) return false;
  const selection = window.getSelection();
  if (!selection.rangeCount) return false;
  let range = selection.getRangeAt(0);
  if (!range.collapsed && event.key !== "Tab" && deleteBlockSelection(range)) {
    event.preventDefault();
    if (event.key !== "Enter") return true;
    range = selection.getRangeAt(0);
  }
  if (event.key === "Tab" && !range.collapsed) {
    if (!dom.noteArea.contains(range.startContainer) || !dom.noteArea.contains(range.endContainer)) return false;
    const blocks = getSelectedBlocks(range);
    if (!blocks.length) return false;
    event.preventDefault();
    editBlocks(() => {
      blocks.forEach((row) => changeDepth(row, event.shiftKey ? -1 : 1));
      renumberLists(dom.noteArea);
    });
    return true;
  }
  const item = listItemAtSelection();
  if (!item) return event.defaultPrevented;
  const content = rowContent(item);
  if (!content.contains(range.startContainer) || !content.contains(range.endContainer)) return false;
  const before = range.cloneRange();
  before.setStart(content, 0);
  const leading = before.cloneContents();
  if (event.key === "Backspace") {
    if (!range.collapsed || leading.textContent.length || leading.querySelector("br, img, video, audio")) return false;
    event.preventDefault();
    editBlocks(() => {
      if (Number(item.dataset.depth) > 0) changeDepth(item, -1);
      else exitList(item);
    });
    return true;
  }
  if (event.key === "Delete") {
    if (!range.collapsed) return false;
    const tail = range.cloneRange();
    tail.selectNodeContents(content);
    tail.setStart(range.endContainer, range.endOffset);
    const remaining = tail.cloneContents();
    if (remaining.textContent.length || remaining.querySelector("img, video, audio")) return false;
    const next = item.nextElementSibling;
    if (!next?.matches("div, p, h1, h2")) return false;
    event.preventDefault();
    editBlocks(() => {
      if (content.lastChild?.nodeName === "BR") content.lastChild.remove();
      const offset = content.childNodes.length;
      const source = rowContent(next);
      if (!emptyContent(source)) content.append(...source.childNodes);
      next.remove();
      ensureContent(content);
      renumberLists(dom.noteArea);
      collapseSelection(content, offset);
    });
    return true;
  }
  event.preventDefault();
  editBlocks(() => {
    if (event.key === "Tab") {
      changeDepth(item, event.shiftKey ? -1 : 1);
      return;
    }
    range.deleteContents();
    if (event.shiftKey) {
      const br = document.createElement("br");
      range.insertNode(br);
      const rest = document.createRange();
      rest.selectNodeContents(content);
      rest.setStartAfter(br);
      const remaining = rest.cloneContents();
      if (!remaining.textContent.length && !remaining.querySelector("br, img, video, audio")) br.after(document.createElement("br"));
      collapseSelection(br.parentNode, Array.prototype.indexOf.call(br.parentNode.childNodes, br) + 1);
      return;
    }
    if (emptyContent(content)) {
      if (Number(item.dataset.depth) > 0) changeDepth(item, -1);
      else exitList(item);
      return;
    }
    const tail = document.createRange();
    tail.selectNodeContents(content);
    tail.setStart(range.startContainer, range.startOffset);
    const trailing = tail.extractContents();
    ensureContent(content);
    const next = createListItemElement("", Number(item.dataset.depth) || 0, false, getListItemType(item));
    next.lastChild.remove();
    next.append(trailing);
    item.after(next);
    normalizeListRows();
    collapseSelection(rowContent(next));
  });
  return true;
}

export function initListItems() {
  document.addEventListener("selectionchange", () => {
    const selection = window.getSelection();
    const item = listItemAtSelection();
    if (!item || !selection.isCollapsed) return;
    const content = rowContent(item);
    if (!content.contains(selection.anchorNode)) collapseSelection(content, selection.anchorNode === item && selection.anchorOffset > 1 ? content.childNodes.length : 0);
  });
  dom.noteArea.addEventListener("beforeinput", (event) => {
    if (event.isComposing || !event.inputType.startsWith("insert")) return;
    const selection = window.getSelection();
    if (!selection.rangeCount || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    const first = selectionBlock(range.startContainer);
    const last = selectionBlock(range.endContainer);
    if (event.inputType === "insertText" && first !== last && first?.parentNode === last?.parentNode && (getListItemType(first) || getListItemType(last))) {
      event.preventDefault();
      editBlocks(() => {
        deleteBlockSelection(range);
        document.execCommand("insertText", false, event.data || "");
      });
    }
  });
  dom.todoBtn.addEventListener("mousedown", (event) => event.preventDefault());
  dom.noteArea.addEventListener("mousedown", (event) => {
    if (event.target.matches('input[type="checkbox"]')) event.preventDefault();
  });
  dom.bulletBtn.addEventListener("mousedown", (event) => event.preventDefault());
  dom.numberBtn?.addEventListener("mousedown", (event) => event.preventDefault());

  dom.noteArea.addEventListener("change", (event) => {
    if (event.target.matches('input[type="checkbox"]')) {
      editBlocks(() => event.target.toggleAttribute("checked", event.target.checked));
    }
  });

  initListClipboard({ deleteBlockSelection });
}

export const todoAtSelection = listItemAtSelection;
export const todoMarkup = createListItemMarkup;
export const toggleList = toggleListItem;
export const convertSelectionToTodos = convertSelectionToListItems;
export const handleTodoKey = handleListItemKey;
export const insertTodoEdit = insertListItemEdit;
