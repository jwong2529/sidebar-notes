import { dom } from "./dom.js";
import { getSelectionElement, isEmptyBlock } from "./range.js";

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
  const element = getSelectionElement(window.getSelection().anchorNode);
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

export function rowContent(row) {
  return row.querySelector?.(":scope > [data-list-content]") || row.querySelector?.("[data-list-content]") || row;
}

export function emptyContent(content) {
  return isEmptyBlock(content, { ignoreBreaks: true });
}

export function ensureContent(content) {
  if (isEmptyBlock(content)) content.append(document.createElement("br"));
}

export function selectionBlock(node) {
  const element = getSelectionElement(node);
  return element.closest(LIST_ITEM_SELECTOR) || element.closest("div, p, h1, h2");
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
    if (isEmptyBlock(content)) content.append(document.createElement("br"));
  });
  renumberLists(root);
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
