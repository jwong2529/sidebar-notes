import { dom } from "./dom.js";
import { triggerSave } from "./storage.js";
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
  }
};

export const LIST_ITEM_ATTRS = Object.values(LIST_ITEM_REGISTRY).map((c) => c.attr);
export const LIST_ITEM_SELECTOR = Object.values(LIST_ITEM_REGISTRY).map((c) => `[${c.attr}]`).join(", ");
export const LIST_PREFIX_SELECTOR = 'input[type="checkbox"], [data-bullet-marker]';

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

export function createListItemMarkup(text = "", depth = 0, checked = false, type = "todo") {
  const config = LIST_ITEM_REGISTRY[type] || LIST_ITEM_REGISTRY.todo;
  const item = document.createElement("div");
  item.setAttribute(config.attr, "true");
  item.dataset.depth = String(depth);
  item.style.marginLeft = `${depth * 24}px`;
  const prefix = config.createPrefix(checked);
  item.append(prefix, text ? document.createTextNode(text) : document.createElement("br"));
  return item.outerHTML;
}

export function stripListPrefixes(element) {
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
  const template = document.createElement("template");
  template.innerHTML = createListItemMarkup("", 0, false, type);
  const row = template.content.firstElementChild;
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
          const template = document.createElement("template");
          template.innerHTML = createListItemMarkup("", Number(group.source.dataset.depth) || 0, false, type);
          const row = template.content.firstElementChild;
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
        const template = document.createElement("template");
        template.innerHTML = createListItemMarkup("", 0, false, type);
        element = template.content.firstElementChild;
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
  const marker = document.createElement("span");
  marker.dataset.todoCaret = "true";
  rows[caretRow].insertBefore(marker, rows[caretRow].childNodes[caretOffset] || null);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  const replaced = range.startContainer === range.endContainer && range.endOffset > range.startOffset
    ? range.startContainer.childNodes[range.startOffset] : null;
  const lastReplaced = replaced ? range.endContainer.childNodes[range.endOffset - 1] : null;
  if (replaced?.nodeType === Node.ELEMENT_NODE) {
    const start = document.createTextNode("\u200b");
    const end = document.createTextNode("\u200b");
    replaced.before(start);
    lastReplaced.after(end);
    range.setStartBefore(start);
    range.setEndAfter(end);
  }
  selection.removeAllRanges();
  selection.addRange(range);
  document.execCommand("insertHTML", false, rows.map((row) => row.outerHTML).join(""));

  const insertedMarker = dom.noteArea.querySelector("[data-todo-caret]");
  if (insertedMarker) {
    range = document.createRange();
    range.setStartBefore(insertedMarker);
    range.collapse(true);
    insertedMarker.remove();
    selection.removeAllRanges();
    selection.addRange(range);
  }
  triggerSave();
}

export function handleParagraphBackspace(event) {
  if (event.key !== "Backspace" || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return false;
  const selection = window.getSelection();
  if (!selection.rangeCount || !selection.isCollapsed) return false;
  const range = selection.getRangeAt(0);
  const node = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement;
  const paragraph = node.closest("div, p, h1, h2");
  if (!paragraph || paragraph === dom.noteArea || !dom.noteArea.contains(paragraph) || paragraph.closest(LIST_ITEM_SELECTOR)) return false;
  let previous = paragraph.previousSibling;
  while (previous?.nodeType === Node.TEXT_NODE && !previous.textContent.replace(/\u200b/g, "").trim()) previous = previous.previousSibling;
  if (!previous?.matches?.(LIST_ITEM_SELECTOR)) return false;
  const leading = document.createRange();
  leading.selectNodeContents(paragraph);
  leading.setEnd(range.startContainer, range.startOffset);
  const fragment = leading.cloneContents();
  if (fragment.textContent.length || fragment.querySelector("img, input, br, video, audio")) return false;
  event.preventDefault();
  const merged = previous.cloneNode(true);
  if (merged.lastChild?.nodeName === "BR") merged.lastChild.remove();
  const caretOffset = merged.childNodes.length;
  const content = paragraph.cloneNode(true);
  if (content.childNodes.length === 1 && content.firstChild.nodeName === "BR") content.firstChild.remove();
  merged.append(...content.childNodes);
  if (merged.childNodes.length === 1) merged.append(document.createElement("br"));
  const replacement = document.createRange();
  replacement.setStartBefore(previous);
  replacement.setEndAfter(paragraph);
  insertListItemEdit(replacement, [merged], 0, caretOffset);
  return true;
}

export function handleListItemKey(event) {
  const item = listItemAtSelection();
  if (!item || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return false;
  const selection = window.getSelection();
  if (!selection.rangeCount) return false;
  const range = selection.getRangeAt(0);
  if (!item.contains(range.startContainer) || !item.contains(range.endContainer)) return false;
  const before = document.createRange();
  before.selectNodeContents(item);
  before.setEnd(range.startContainer, range.startOffset);
  const leading = before.cloneContents();
  leading.querySelectorAll("input, br, [data-bullet-marker]").forEach((node) => node.remove());
  if (event.key === "Backspace" && range.collapsed && !leading.textContent.length && !leading.querySelector("img")) {
    event.preventDefault();
    const plain = document.createElement("div");
    const content = item.cloneNode(true);
    stripListPrefixes(content);
    plain.append(...content.childNodes);
    if (!plain.hasChildNodes()) plain.append(document.createElement("br"));
    const replacement = document.createRange();
    replacement.selectNode(item);
    insertListItemEdit(replacement, [plain], 0, 0);
    return true;
  }
  if (event.key === "Tab") {
    event.preventDefault();
    const clone = item.cloneNode(true);
    const depth = Math.max(0, Math.min(12, (Number(item.dataset.depth) || 0) + (event.shiftKey ? -1 : 1)));
    clone.dataset.depth = String(depth);
    clone.style.marginLeft = `${depth * 24}px`;
    const replacement = document.createRange();
    replacement.selectNode(item);
    insertListItemEdit(replacement, [clone], 0, clone.childNodes.length - (clone.lastChild?.nodeName === "BR" ? 1 : 0));
    return true;
  }
  if (event.key !== "Enter" || event.shiftKey) return false;
  event.preventDefault();
  if (!item.textContent.length && !item.querySelector("img, video, audio")) {
    const plain = document.createElement("div");
    plain.append(document.createElement("br"));
    const replacement = document.createRange();
    replacement.selectNode(item);
    insertListItemEdit(replacement, [plain], 0, 0);
    return true;
  }
  const after = document.createRange();
  after.selectNodeContents(item);
  after.setStart(range.endContainer, range.endOffset);
  const trailing = after.cloneContents();
  const first = item.cloneNode(false);
  const prefixNode = item.querySelector(LIST_PREFIX_SELECTOR);
  first.append(prefixNode ? prefixNode.cloneNode(true) : document.createElement("br"));
  const head = before.cloneContents();
  stripListPrefixes(head);
  stripListPrefixes(trailing);
  if (head.lastChild?.nodeName === "BR") head.lastChild.remove();
  first.append(head);
  if (first.childNodes.length === 1) first.append(document.createElement("br"));
  const currentType = getListItemType(item) || "todo";
  const template = document.createElement("template");
  template.innerHTML = createListItemMarkup("", Number(item.dataset.depth) || 0, false, currentType);
  const next = template.content.firstElementChild;
  if (trailing.hasChildNodes()) {
    next.lastChild.remove();
    next.append(trailing);
  }
  const replacement = document.createRange();
  replacement.selectNode(item);
  insertListItemEdit(replacement, [first, next], 1, 1);
  return true;
}

export function initListItems() {
  dom.todoBtn.addEventListener("mousedown", (event) => event.preventDefault());
  dom.noteArea.addEventListener("mousedown", (event) => {
    if (event.target.matches('input[type="checkbox"]')) event.preventDefault();
  });
  dom.bulletBtn.addEventListener("mousedown", (event) => event.preventDefault());

  dom.noteArea.addEventListener("change", (event) => {
    if (event.target.matches('input[type="checkbox"]')) {
      event.target.toggleAttribute("checked", event.target.checked);
      triggerSave();
    }
  });

  for (const action of ["copy", "cut"]) {
    dom.noteArea.addEventListener(action, (event) => {
      const selection = window.getSelection();
      if (!selection.rangeCount || selection.isCollapsed) return;
      const range = selection.getRangeAt(0);
      const container = document.createElement("div");
      container.append(range.cloneContents());
      if (!container.querySelector(`${LIST_ITEM_SELECTOR}, ${LIST_PREFIX_SELECTOR}`)) return;
      event.preventDefault();
      event.clipboardData.setData("text/html", container.innerHTML);
      for (const config of Object.values(LIST_ITEM_REGISTRY)) {
        if (config.toText && config.isPrefix) {
          container.querySelectorAll("*").forEach((el) => {
            if (config.isPrefix(el)) {
              el.replaceWith(document.createTextNode(config.toText(el)));
            }
          });
        }
      }
      container.querySelectorAll("div").forEach((line) => line.append(document.createTextNode("\n")));
      event.clipboardData.setData("text/plain", container.textContent);
      if (action === "cut") {
        document.execCommand("delete");
        triggerSave();
      }
    });
  }

  dom.noteArea.addEventListener("paste", (event) => {
    if (event.defaultPrevented) return;
    const html = event.clipboardData.getData("text/html");
    const doc = new DOMParser().parseFromString(html, "text/html");
    if (!doc.querySelector(`${LIST_ITEM_SELECTOR}, ${LIST_PREFIX_SELECTOR}`)) return;
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
      if (detectedType) {
        const config = LIST_ITEM_REGISTRY[detectedType];
        node.setAttribute(config.attr, "true");
        node.dataset.depth = String(depth);
        node.style.marginLeft = `${depth * 24}px`;
      }
    }
    document.execCommand("insertHTML", false, doc.body.innerHTML);
    triggerSave();
  });
}

export const todoAtSelection = listItemAtSelection;
export const todoMarkup = createListItemMarkup;
export const toggleList = toggleListItem;
export const convertSelectionToTodos = convertSelectionToListItems;
export const handleTodoKey = handleListItemKey;
export const insertTodoEdit = insertListItemEdit;