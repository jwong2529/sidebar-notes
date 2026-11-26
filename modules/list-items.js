import { linkify } from "./links.js";
import { dom } from "./dom.js";
import { triggerSave } from "./storage.js";
import { editBlocks } from "./editor-history.js";
import { getEditorRange } from "./range.js";

export const LIST_ITEM_REGISTRY = {
  todo: {
    attr: "data-todo",
    createPrefix(checked = false) {
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.setAttribute("aria-label", "Complete task");
      if (checked) checkbox.setAttribute("checked", "");
      return checkbox;
    },
    isPrefix(node) {
      return node.matches?.('input[type="checkbox"]');
    },
    toText(node) {
      return node.hasAttribute("checked") ? "[x] " : "[ ] ";
    }
  },
  bullet: {
    attr: "data-bullet",
    createPrefix() {
      const marker = document.createElement("span");
      marker.setAttribute("data-bullet-marker", "true");
      marker.dataset.bulletMarker = "true";
      marker.setAttribute("aria-hidden", "true");
      marker.style.cssText = "display: inline-block; width: 5px; height: 5px; margin: 0 9px 0 4px; vertical-align: 2px; border-radius: 50%; background: currentColor;";
      return marker;
    },
    isPrefix(node) {
      return node.hasAttribute?.("data-bullet-marker");
    },
    toText() {
      return "- ";
    }
  },
  number: {
    attr: "data-number",
    createPrefix(value = "1.") {
      const marker = document.createElement("span");
      marker.setAttribute("data-number-marker", "true");
      marker.dataset.numberMarker = "true";
      marker.setAttribute("aria-hidden", "true");
      marker.contentEditable = "false";
      marker.setAttribute("tabindex", "-1");
      marker.textContent = typeof value === "string" ? value : "1.";
      return marker;
    },
    isPrefix(node) {
      return node.hasAttribute?.("data-number-marker");
    },
    toText(node) {
      const text = node.textContent?.trim();
      return text ? `${text} ` : "1. ";
    }
  }
};

export const LIST_ITEM_ATTRS = Object.values(LIST_ITEM_REGISTRY).map((c) => c.attr);
export const LIST_ITEM_SELECTOR = Object.values(LIST_ITEM_REGISTRY).map((c) => `[${c.attr}]`).join(", ");
export const LIST_PREFIX_SELECTOR = 'input[type="checkbox"], [data-bullet-marker], [data-number-marker]';

export function getListItemType(element) {
  for (const [type, config] of Object.entries(LIST_ITEM_REGISTRY)) {
    if (element?.hasAttribute?.(config.attr)) return type;
  }
  return null;
}

export function listItemAtSelection() {
  const node = window.getSelection().anchorNode;
  const element = node && (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement);
  const item = element && element.closest(LIST_ITEM_SELECTOR);
  return item && dom.noteArea.contains(item) ? item : null;
}

export function bulletMarker() {
  return LIST_ITEM_REGISTRY.bullet.createPrefix();
}

export function createListItemElement(text = "", depth = 0, checked = false, type = "todo") {
  const config = LIST_ITEM_REGISTRY[type] || LIST_ITEM_REGISTRY.todo;
  const item = document.createElement("div");
  item.setAttribute(config.attr, "true");
  item.dataset.depth = String(depth);
  item.style.marginLeft = `${depth * 24}px`;
  const prefix = config.createPrefix(checked);
  item.append(prefix, text ? document.createTextNode(text) : document.createElement("br"));
  return item;
}

export function createListItemMarkup(text = "", depth = 0, checked = false, type = "todo") {
  return createListItemElement(text, depth, checked, type).outerHTML;
}

export function stripListPrefixes(element) {
  element.querySelectorAll("[data-list-content]").forEach((node) => node.replaceWith(...node.childNodes));
  element.querySelectorAll(LIST_PREFIX_SELECTOR).forEach((node) => node.remove());
}

export function clearListItemAttributes(element) {
  for (const attr of LIST_ITEM_ATTRS) {
    element.removeAttribute(attr);
  }
  element.removeAttribute("data-depth");
  element.style.removeProperty("margin-left");
  stripListPrefixes(element);
}

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
  const node = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement;
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

export function renumberLists(root = dom.noteArea) {
  const container = (dom?.noteArea && dom.noteArea.contains(root)) ? dom.noteArea : root;
  if (!container) return;
  const elements = Array.from(container.childNodes || []).filter((node) => node.nodeType === 1);
  const counters = new Map();
  for (const child of elements) {
    if (child.matches?.("[data-number]") || child.hasAttribute?.("data-number")) {
      const depth = Math.max(0, Math.min(12, Number(child.dataset?.depth ?? child.getAttribute?.("data-depth")) || 0));
      for (const key of Array.from(counters.keys())) {
        if (key > depth) counters.delete(key);
      }
      const count = (counters.get(depth) || 0) + 1;
      counters.set(depth, count);
      const expected = `${count}.`;
      let marker = null;
      for (const node of child.childNodes || []) {
        if (node.nodeType === 1 && (node.matches?.("[data-number-marker]") || node.hasAttribute?.("data-number-marker"))) {
          marker = node;
          break;
        }
      }
      if (marker) {
        if (marker.textContent !== expected) marker.textContent = expected;
      } else {
        const newMarker = LIST_ITEM_REGISTRY.number.createPrefix(expected);
        child.insertBefore(newMarker, child.firstChild);
      }
    } else {
      counters.clear();
    }
  }
}

export function normalizeListRows(root = dom.noteArea) {
  root.querySelectorAll("[data-todo-caret], [data-list-selection], [data-list-placeholder]").forEach((node) => node.remove());
  root.querySelectorAll(LIST_ITEM_SELECTOR).forEach((row) => {
    let content = row.querySelector(":scope > [data-list-content]");
    if (!content) {
      content = document.createElement("div");
      content.dataset.listContent = "true";
      const nodes = Array.from(row.childNodes).filter((node) => !node.matches?.(LIST_PREFIX_SELECTOR));
      content.append(...nodes);
      row.append(content);
    }
    row.querySelectorAll(":scope > input, :scope > [data-bullet-marker], :scope > [data-number-marker]").forEach((prefix) => {
      prefix.contentEditable = "false";
      prefix.setAttribute("tabindex", "-1");
    });
    if (!content.textContent.length && !content.querySelector("br, img, video, audio")) content.append(document.createElement("br"));
  });
  renumberLists(root);
}

function selectPoint(node, offset = 0) {
  dom.noteArea.focus();
  window.getSelection().collapse(node, offset);
}

export function rowContent(row) {
  return row.querySelector?.(":scope > [data-list-content]") || row.querySelector?.("[data-list-content]") || row;
}

function emptyContent(content) {
  return !content.textContent.length && !content.querySelector("img, video, audio");
}

function ensureContent(content) {
  if (!content.textContent.length && !content.querySelector("br, img, video, audio")) content.append(document.createElement("br"));
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
    selectPoint(parent, offset);
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
  const element = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement;
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
    selectPoint(target, offset);
  });
  return true;
}

export function changeDepth(item, delta) {
  const isList = Boolean(getListItemType(item));
  const currentDepth = Number(item.dataset.depth) || 0;
  const depth = Math.max(0, Math.min(12, currentDepth + delta));
  if (depth === 0 && !isList) {
    item.removeAttribute("data-depth");
    item.style.removeProperty("margin-left");
  } else {
    item.dataset.depth = String(depth);
    item.style.marginLeft = `${depth * 24}px`;
  }
  if (item.hasAttribute("data-number")) {
    renumberLists(item.parentElement || dom.noteArea);
  }
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
  selectPoint(paragraph);
}

function selectionBlock(node) {
  const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  return element.closest(LIST_ITEM_SELECTOR) || element.closest("div, p, h1, h2");
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
    selectPoint(start, offset);
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
      selectPoint(content, offset);
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
      selectPoint(br.parentNode, Array.prototype.indexOf.call(br.parentNode.childNodes, br) + 1);
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
    selectPoint(rowContent(next));
  });
  return true;
}

export function initListItems() {
  document.addEventListener("selectionchange", () => {
    const selection = window.getSelection();
    const item = listItemAtSelection();
    if (!item || !selection.isCollapsed) return;
    const content = rowContent(item);
    if (!content.contains(selection.anchorNode)) selectPoint(content, selection.anchorNode === item && selection.anchorOffset > 1 ? content.childNodes.length : 0);
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

function isFullListItemSelection(item, range) {
  const content = rowContent(item);
  if (!content.contains(range.startContainer) || !content.contains(range.endContainer)) {
    return range.intersectsNode(item);
  }
  const head = document.createRange();
  head.selectNodeContents(content);
  head.setEnd(range.startContainer, range.startOffset);
  const tail = document.createRange();
  tail.selectNodeContents(content);
  tail.setStart(range.endContainer, range.endOffset);
  const headFrag = head.cloneContents();
  const tailFrag = tail.cloneContents();
  return !headFrag.textContent.length && !headFrag.querySelector("img, video, audio")
    && !tailFrag.textContent.length && !tailFrag.querySelector("img, video, audio");
}

function ensureClonedListPrefixes(container, firstBlock) {
  for (const row of container.querySelectorAll(LIST_ITEM_SELECTOR)) {
    const type = getListItemType(row);
    const config = LIST_ITEM_REGISTRY[type];
    if (!config) continue;
    const hasPrefix = Array.from(row.childNodes).some((node) => config.isPrefix(node));
    if (!hasPrefix) {
      let checked = false;
      if (type === "todo" && row === container.firstElementChild && firstBlock) {
        checked = Boolean(firstBlock.querySelector('input[type="checkbox"][checked]'));
      }
      if (type === "number" && row === container.firstElementChild && firstBlock) {
        const marker = firstBlock.querySelector("[data-number-marker]");
        row.prepend(config.createPrefix(marker?.textContent || "1."));
      } else {
        row.prepend(config.createPrefix(checked));
      }
    }
  }
}

function serializeClipboardHtml(source) {
  const root = document.createElement("div");
  const stack = [];
  for (const node of Array.from(source.childNodes)) {
    const type = node.nodeType === Node.ELEMENT_NODE ? getListItemType(node) : null;
    if (!type) {
      stack.length = 0;
      root.append(node.cloneNode(true));
      continue;
    }
    const depth = Math.max(0, Math.min(12, Number(node.dataset?.depth) || 0));
    const tag = type === "number" ? "ol" : "ul";
    while (stack.length && (stack[stack.length - 1].depth > depth || (stack[stack.length - 1].depth === depth && stack[stack.length - 1].type !== type))) {
      stack.pop();
    }
    while (!stack.length || stack[stack.length - 1].depth < depth) {
      const list = document.createElement(tag);
      const nextDepth = stack.length ? stack[stack.length - 1].depth + 1 : depth;
      if (!stack.length) {
        root.append(list);
      } else {
        const parent = stack[stack.length - 1];
        if (!parent.lastLi) {
          parent.lastLi = document.createElement("li");
          parent.list.append(parent.lastLi);
        }
        parent.lastLi.append(list);
      }
      stack.push({ list, type, depth: nextDepth, lastLi: null });
    }
    const li = document.createElement("li");
    if (type === "todo") {
      li.setAttribute("data-todo", "true");
      const checkbox = node.querySelector('input[type="checkbox"]');
      li.append(LIST_ITEM_REGISTRY.todo.createPrefix(Boolean(checkbox?.hasAttribute("checked"))));
    }
    const content = rowContent(node);
    for (const child of Array.from(content.childNodes)) {
      li.append(child.cloneNode(true));
    }
    stack[stack.length - 1].list.append(li);
    stack[stack.length - 1].lastLi = li;
  }
  return root.innerHTML;
}

function flattenHtmlList(listNode, depth = 0) {
  const rows = [];
  const defaultType = listNode.tagName === "OL" ? "number" : "bullet";
  for (const child of Array.from(listNode.children)) {
    if (child.tagName !== "LI") continue;
    const isTodo = child.hasAttribute("data-todo") || Boolean(child.querySelector(':scope > input[type="checkbox"]'));
    const type = isTodo ? "todo" : defaultType;
    const checkbox = isTodo ? child.querySelector(':scope > input[type="checkbox"]') : null;
    const checked = Boolean(checkbox?.hasAttribute("checked"));
    const nestedLists = [];
    const inlineNodes = [];
    for (const node of Array.from(child.childNodes)) {
      if (node === checkbox) continue;
      if (node.nodeType === Node.ELEMENT_NODE && (node.tagName === "UL" || node.tagName === "OL")) {
        nestedLists.push(node);
      } else {
        inlineNodes.push(node);
      }
    }
    if (inlineNodes.length || !nestedLists.length) {
      const row = createListItemElement("", Math.min(12, depth), checked, type);
      row.lastChild.remove();
      const content = document.createElement("div");
      content.dataset.listContent = "true";
      content.append(...inlineNodes);
      ensureContent(content);
      row.append(content);
      rows.push(row);
    }
    for (const nested of nestedLists) {
      rows.push(...flattenHtmlList(nested, depth + 1));
    }
  }
  return rows;
}

  for (const action of ["copy", "cut"]) {
    dom.noteArea.addEventListener(action, (event) => {
      const selection = window.getSelection();
      if (!selection.rangeCount || selection.isCollapsed) return;
      const range = selection.getRangeAt(0);
      const container = document.createElement("div");
      container.append(range.cloneContents());
      const firstBlock = selectionBlock(range.startContainer);
      const lastBlock = selectionBlock(range.endContainer);
      const firstType = getListItemType(firstBlock);
      if (firstType && firstBlock === lastBlock && !container.querySelector(`${LIST_ITEM_SELECTOR}, ${LIST_PREFIX_SELECTOR}`) && isFullListItemSelection(firstBlock, range)) {
        const row = firstBlock.cloneNode(false);
        const content = document.createElement("div");
        content.dataset.listContent = "true";
        content.append(...container.childNodes);
        row.append(content);
        container.replaceChildren(row);
      }
      if (!container.querySelector(`${LIST_ITEM_SELECTOR}, ${LIST_PREFIX_SELECTOR}`)) return;
      ensureClonedListPrefixes(container, firstBlock);
      event.preventDefault();
      event.clipboardData.setData("text/html", serializeClipboardHtml(container));
      for (const row of container.querySelectorAll(LIST_ITEM_SELECTOR)) {
        const depth = Math.max(0, Math.min(12, Number(row.dataset?.depth) || 0));
        if (depth > 0) row.prepend(document.createTextNode("  ".repeat(depth)));
      }
      for (const config of Object.values(LIST_ITEM_REGISTRY)) {
        if (config.toText && config.isPrefix) {
          container.querySelectorAll("*").forEach((el) => {
            if (config.isPrefix(el)) {
              el.replaceWith(document.createTextNode(config.toText(el)));
            }
          });
        }
      }
      container.querySelectorAll("div:not([data-list-content])").forEach((line) => line.append(document.createTextNode("\n")));
      event.clipboardData.setData("text/plain", container.textContent);
      if (action === "cut") {
        editBlocks(() => {
          if (!deleteBlockSelection(range)) {
            document.execCommand("delete");
          }
          normalizeListRows();
        });
      }
    });
  }

  dom.noteArea.addEventListener("paste", (event) => {
    if (event.defaultPrevented) return;
    const html = event.clipboardData.getData("text/html");
    const doc = new DOMParser().parseFromString(html, "text/html");
    if (!doc.querySelector(`${LIST_ITEM_SELECTOR}, ${LIST_PREFIX_SELECTOR}, ul, ol, li`)) return;
    event.preventDefault();
    const allowed = new Set(["DIV", "P", "BR", "SPAN", "B", "STRONG", "I", "EM", "U", "S", "UL", "OL", "LI", "H1", "H2", "INPUT", "A", "IMG", "BLOCKQUOTE", "PRE", "CODE", "TABLE", "TBODY", "TR", "TD", "TH"]);
    doc.body.querySelectorAll("script, style, iframe, object").forEach((node) => node.remove());
    for (const node of Array.from(doc.body.querySelectorAll("*"))) {
      if (!allowed.has(node.tagName)) {
        node.replaceWith(...node.childNodes);
        continue;
      }
      const detectedType = getListItemType(node);
      const marker = node.hasAttribute("data-bullet-marker");
      const numberMarker = node.hasAttribute("data-number-marker");
      const content = node.hasAttribute("data-list-content");
      const depth = Math.max(0, Math.min(12, Number(node.dataset.depth) || 0));
      const checked = node.hasAttribute("checked");
      const checkbox = node.matches('input[type="checkbox"]');
      const href = node.getAttribute("href") || "";
      const src = node.getAttribute("src") || "";
      const alt = node.getAttribute("alt") || "";
      const width = node.style.width || node.getAttribute("width") || "";
      for (const attr of Array.from(node.attributes)) node.removeAttribute(attr.name);
      if (node.tagName === "A" && /^(https?:|mailto:|tel:|#)/i.test(href.trim())) node.setAttribute("href", href.trim());
      if (node.tagName === "IMG") {
        if (!/^(https?:|data:image\/(?:png|jpe?g|gif|webp|avif|bmp);base64,)/i.test(src.trim())) {
          node.replaceWith(document.createTextNode(alt));
          continue;
        }
        node.setAttribute("src", src.trim());
        node.setAttribute("alt", alt);
        if (/^\d+(?:\.\d+)?(?:px|%)?$/.test(width)) node.style.width = /^\d+$/.test(width) ? `${width}px` : width;
      }
      if (node.tagName === "INPUT") {
        if (!checkbox) { node.remove(); continue; }
        node.type = "checkbox";
        node.setAttribute("aria-label", "Complete task");
        node.toggleAttribute("checked", checked);
      }
      if (marker && node.tagName === "SPAN") node.replaceWith(bulletMarker());
      if (numberMarker && node.tagName === "SPAN") node.replaceWith(LIST_ITEM_REGISTRY.number.createPrefix(node.textContent));
      if (content) node.dataset.listContent = "true";
      if (detectedType) {
        const config = LIST_ITEM_REGISTRY[detectedType];
        node.setAttribute(config.attr, "true");
        node.dataset.depth = String(depth);
        node.style.marginLeft = `${depth * 24}px`;
      }
    }
    for (const list of Array.from(doc.body.querySelectorAll("ul, ol"))) {
      if (list.parentElement?.closest("ul, ol")) continue;
      const rows = flattenHtmlList(list, 0);
      list.replaceWith(...rows);
    }
    for (const li of Array.from(doc.body.querySelectorAll("li"))) {
      const row = createListItemElement("", 0, false, "bullet");
      row.lastChild.remove();
      const content = document.createElement("div");
      content.dataset.listContent = "true";
      content.append(...li.childNodes);
      ensureContent(content);
      row.append(content);
      li.replaceWith(row);
    }
    editBlocks(() => {
      const range = getEditorRange();
      const block = selectionBlock(range.startContainer);
      const content = block && block !== dom.noteArea ? rowContent(block) : null;
      const nodes = Array.from(doc.body.childNodes);
      if (!nodes.length) return;
      if (content?.contains(range.startContainer) && content.contains(range.endContainer)) {
        range.deleteContents();
        const tail = document.createRange();
        tail.selectNodeContents(content);
        tail.setStart(range.startContainer, range.startOffset);
        const trailing = tail.extractContents();
        block.after(...nodes);
        if (emptyContent(content)) block.remove();
        else ensureContent(content);
        normalizeListRows();
        const last = nodes[nodes.length - 1];
        if (last.nodeType === Node.ELEMENT_NODE) {
          const target = rowContent(last);
          const offset = target.childNodes.length;
          target.append(trailing);
          ensureContent(target);
          selectPoint(target, offset);
        } else selectPoint(last, last.length);
      } else {
        range.deleteContents();
        const fragment = document.createDocumentFragment();
        fragment.append(...nodes);
        range.insertNode(fragment);
        normalizeListRows();
        const last = nodes[nodes.length - 1];
        const target = last.nodeType === Node.ELEMENT_NODE ? rowContent(last) : last;
        selectPoint(target, target.nodeType === Node.TEXT_NODE ? target.length : target.childNodes.length);
      }
      linkify(dom.noteArea, true);
    });
  });
}

export const todoAtSelection = listItemAtSelection;
export const todoMarkup = createListItemMarkup;
export const toggleList = toggleListItem;
export const convertSelectionToTodos = convertSelectionToListItems;
export const handleTodoKey = handleListItemKey;
export const insertTodoEdit = insertListItemEdit;
