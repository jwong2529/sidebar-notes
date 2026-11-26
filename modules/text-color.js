import { dom } from "./dom.js";
import { editBlocks } from "./editor-history.js";
import { LIST_PREFIX_SELECTOR } from "./list-items.js";

export const TEXT_COLORS = [
  { id: null, label: "Default", cssVar: "var(--color-text)" },
  { id: "gray", label: "Gray", cssVar: "var(--text-color-gray)" },
  { id: "brown", label: "Brown", cssVar: "var(--text-color-brown)" },
  { id: "orange", label: "Orange", cssVar: "var(--text-color-orange)" },
  { id: "yellow", label: "Yellow", cssVar: "var(--text-color-yellow)" },
  { id: "green", label: "Green", cssVar: "var(--text-color-green)" },
  { id: "blue", label: "Blue", cssVar: "var(--text-color-blue)" },
  { id: "purple", label: "Purple", cssVar: "var(--text-color-purple)" },
  { id: "pink", label: "Pink", cssVar: "var(--text-color-pink)" },
  { id: "red", label: "Red", cssVar: "var(--text-color-red)" }
];

const VALID_COLOR_IDS = new Set(TEXT_COLORS.filter((c) => c.id).map((c) => c.id));

let pendingTextColor;
let pendingCaretKey = null;

function getColorVar(colorId) {
  const entry = TEXT_COLORS.find((c) => c.id === colorId);
  return entry ? entry.cssVar : "var(--color-text)";
}

function getCaretKey() {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount || !selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  return `${range.startOffset}:${range.startContainer.nodeValue || ""}`;
}

function isInsideListPrefix(node, root) {
  let current = node && node.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
  while (current && current !== root) {
    if (current.matches && current.matches(LIST_PREFIX_SELECTOR)) return true;
    current = current.parentElement;
  }
  return false;
}

export function getColorSpanAncestor(node, root = dom.noteArea) {
  let current = node && node.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
  while (current && current !== root) {
    if (current.dataset && VALID_COLOR_IDS.has(current.dataset.textColor)) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

function collectIntersectingTextNodes(range, root) {
  const nodes = [];
  const walk = (node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        if (child.matches && child.matches(LIST_PREFIX_SELECTOR)) continue;
        walk(child);
      } else if (child.nodeType === Node.TEXT_NODE && child.nodeValue.length > 0) {
        if (typeof range.intersectsNode === "function" ? range.intersectsNode(child) : true) {
          nodes.push(child);
        }
      }
    }
  };
  walk(root);
  return nodes;
}

function splitBoundaryTextNodes(textNodes, range) {
  if (!textNodes.length) return [];
  if (textNodes.length === 1) {
    let node = textNodes[0];
    const start = range.startContainer === node ? range.startOffset : 0;
    const end = range.endContainer === node ? range.endOffset : node.nodeValue.length;
    if (end < node.nodeValue.length) {
      node.splitText(end);
    }
    if (start > 0 && start < node.nodeValue.length) {
      node = node.splitText(start);
    }
    return [node];
  }

  const result = [...textNodes];
  const first = result[0];
  if (range.startContainer === first && range.startOffset > 0 && range.startOffset < first.nodeValue.length) {
    result[0] = first.splitText(range.startOffset);
  }
  const last = result[result.length - 1];
  if (range.endContainer === last && range.endOffset > 0 && range.endOffset < last.nodeValue.length) {
    last.splitText(range.endOffset);
  }
  return result;
}

function hasMeaningfulContent(fragment) {
  if (!fragment) return false;
  if (fragment.textContent && fragment.textContent.length > 0) return true;
  return Boolean(fragment.querySelector && fragment.querySelector("br, img, video, audio, hr"));
}

function spanHasOtherText(span, selectedSet) {
  const walk = (node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE && child.nodeValue.length > 0) {
        if (!selectedSet.has(child)) return true;
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        if (walk(child)) return true;
      }
    }
    return false;
  };
  return walk(span);
}

function isolateNodeFromSpan(node, span) {
  const beforeRange = document.createRange();
  beforeRange.setStart(span, 0);
  beforeRange.setEndBefore(node);
  const beforeFrag = beforeRange.extractContents();
  if (hasMeaningfulContent(beforeFrag)) {
    const beforeSpan = span.cloneNode(false);
    beforeSpan.appendChild(beforeFrag);
    span.parentNode.insertBefore(beforeSpan, span);
  }

  const afterRange = document.createRange();
  afterRange.setStartAfter(node);
  afterRange.setEnd(span, span.childNodes.length);
  const afterFrag = afterRange.extractContents();
  if (hasMeaningfulContent(afterFrag)) {
    const afterSpan = span.cloneNode(false);
    afterSpan.appendChild(afterFrag);
    span.parentNode.insertBefore(afterSpan, span.nextSibling);
  }
}

function unwrapElement(el) {
  const parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) {
    parent.insertBefore(el.firstChild, el);
  }
  el.remove();
}

export function normalizeColorSpans(root = dom.noteArea) {
  const spans = Array.from(root.querySelectorAll("[data-text-color]"));
  for (const span of spans) {
    if (!span.isConnected) continue;
    if (!VALID_COLOR_IDS.has(span.dataset.textColor)) {
      unwrapElement(span);
      continue;
    }
    if (!span.textContent.length && !span.querySelector("br, img, video, audio")) {
      span.remove();
      continue;
    }
    const parentSpan = getColorSpanAncestor(span.parentNode, root);
    if (parentSpan && parentSpan.dataset.textColor === span.dataset.textColor) {
      unwrapElement(span);
    }
  }

  let merged = true;
  while (merged) {
    merged = false;
    const currentSpans = Array.from(root.querySelectorAll("[data-text-color]"));
    for (const span of currentSpans) {
      if (!span.isConnected) continue;
      const next = span.nextSibling;
      if (
        next &&
        next.nodeType === Node.ELEMENT_NODE &&
        next.tagName === "SPAN" &&
        next.dataset?.textColor === span.dataset.textColor
      ) {
        while (next.firstChild) {
          span.appendChild(next.firstChild);
        }
        next.remove();
        span.normalize();
        merged = true;
        break;
      }
    }
  }
}

export function applyTextColorToRange(range, colorId, root = dom.noteArea) {
  if (!range || !root.contains(range.commonAncestorContainer)) return null;
  const rawNodes = collectIntersectingTextNodes(range, root);
  if (!rawNodes.length) return null;

  const textNodes = splitBoundaryTextNodes(rawNodes, range);
  const selectedSet = new Set(textNodes);

  for (const textNode of textNodes) {
    if (isInsideListPrefix(textNode, root)) continue;
    const colorSpan = getColorSpanAncestor(textNode, root);
    if (colorSpan) {
      if (colorSpan.dataset.textColor === colorId) continue;
      if (spanHasOtherText(colorSpan, selectedSet)) {
        isolateNodeFromSpan(textNode, colorSpan);
      }
      if (colorId) {
        colorSpan.dataset.textColor = colorId;
      } else {
        unwrapElement(colorSpan);
      }
    } else if (colorId) {
      const span = document.createElement("span");
      span.dataset.textColor = colorId;
      textNode.parentNode.insertBefore(span, textNode);
      span.appendChild(textNode);
    }
  }

  normalizeColorSpans(root);
  return {
    startNode: textNodes[0],
    endNode: textNodes[textNodes.length - 1]
  };
}

export function getSelectionTextColor(root = dom.noteArea) {
  if (pendingTextColor !== undefined) {
    return pendingTextColor;
  }
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;

  if (range.collapsed) {
    const span = getColorSpanAncestor(range.startContainer, root);
    return span ? span.dataset.textColor : null;
  }

  const textNodes = collectIntersectingTextNodes(range, root);
  if (!textNodes.length) {
    const span = getColorSpanAncestor(range.startContainer, root);
    return span ? span.dataset.textColor : null;
  }

  let detected = undefined;
  for (const textNode of textNodes) {
    const span = getColorSpanAncestor(textNode, root);
    const color = span ? span.dataset.textColor : null;
    if (detected === undefined) {
      detected = color;
    } else if (detected !== color) {
      return null;
    }
  }
  return detected || null;
}

export function updateTextColorIndicator() {
  if (!dom.textColorBtn || !dom.textColorIndicator) return;
  const activeColor = getSelectionTextColor();
  dom.textColorIndicator.style.backgroundColor = getColorVar(activeColor);
  dom.textColorBtn.classList.toggle("active", Boolean(activeColor));

  if (dom.textColorMenu) {
    dom.textColorMenu.querySelectorAll(".text-color-swatch").forEach((swatch) => {
      const swatchColor = swatch.dataset.color || null;
      const isActive = swatchColor === activeColor;
      swatch.classList.toggle("active", isActive);
      swatch.setAttribute("aria-checked", isActive ? "true" : "false");
    });
  }
}

export function applyTextColor(colorId, onComplete) {
  const normalized = colorId && VALID_COLOR_IDS.has(colorId) ? colorId : null;
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount) {
    pendingTextColor = normalized;
    pendingCaretKey = null;
    dom.noteArea.focus();
    updateTextColorIndicator();
    return;
  }

  const range = selection.getRangeAt(0);
  if (!dom.noteArea.contains(range.commonAncestorContainer)) {
    dom.noteArea.focus();
    return;
  }

  if (range.collapsed) {
    pendingTextColor = normalized;
    pendingCaretKey = getCaretKey();
    dom.noteArea.focus();
    updateTextColorIndicator();
    if (onComplete) onComplete();
    return;
  }

  pendingTextColor = undefined;
  pendingCaretKey = null;

  editBlocks(() => {
    const bounds = applyTextColorToRange(range, normalized, dom.noteArea);
    if (bounds) {
      const nextRange = document.createRange();
      nextRange.setStart(bounds.startNode, 0);
      nextRange.setEnd(bounds.endNode, bounds.endNode.nodeValue.length);
      selection.removeAllRanges();
      selection.addRange(nextRange);
    }
    dom.noteArea.focus();
    updateTextColorIndicator();
    if (onComplete) onComplete();
  });
}

function handlePendingColorInput(event) {
  if (pendingTextColor === undefined) return;
  if (event.inputType !== "insertText" && event.inputType !== "insertCompositionText") {
    pendingTextColor = undefined;
    pendingCaretKey = null;
    return;
  }
  if (!event.data) return;

  const selection = window.getSelection();
  if (!selection || !selection.rangeCount || !selection.isCollapsed) {
    pendingTextColor = undefined;
    pendingCaretKey = null;
    return;
  }
  const range = selection.getRangeAt(0);
  if (!dom.noteArea.contains(range.startContainer) || isInsideListPrefix(range.startContainer, dom.noteArea)) {
    pendingTextColor = undefined;
    pendingCaretKey = null;
    return;
  }

  event.preventDefault();
  const targetColor = pendingTextColor;
  pendingTextColor = undefined;
  pendingCaretKey = null;

  editBlocks(() => {
    const textNode = document.createTextNode(event.data);
    range.insertNode(textNode);

    const existingSpan = getColorSpanAncestor(textNode, dom.noteArea);
    if (targetColor) {
      if (!existingSpan || existingSpan.dataset.textColor !== targetColor) {
        if (existingSpan) {
          isolateNodeFromSpan(textNode, existingSpan);
          existingSpan.dataset.textColor = targetColor;
        } else {
          const span = document.createElement("span");
          span.dataset.textColor = targetColor;
          textNode.parentNode.insertBefore(span, textNode);
          span.appendChild(textNode);
        }
      }
    } else if (existingSpan) {
      isolateNodeFromSpan(textNode, existingSpan);
      unwrapElement(existingSpan);
    }

    normalizeColorSpans(dom.noteArea);
    const nextRange = document.createRange();
    nextRange.setStart(textNode, textNode.nodeValue.length);
    nextRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(nextRange);
    updateTextColorIndicator();
  });
}

export function initTextColor({ closeFormatMenus, positionFormatMenu, updateFormatIndicators }) {
  if (!dom.textColorBtn || !dom.textColorMenu) return;

  const grid = document.createElement("div");
  grid.className = "text-color-grid";

  for (const color of TEXT_COLORS) {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "text-color-swatch";
    swatch.setAttribute("role", "menuitemradio");
    swatch.setAttribute("aria-checked", "false");
    swatch.title = color.label;
    swatch.setAttribute("aria-label", color.label);
    swatch.dataset.color = color.id || "";
    swatch.style.setProperty("--swatch-color", color.cssVar);
    swatch.textContent = "A";
    swatch.addEventListener("mousedown", (e) => e.preventDefault());
    swatch.addEventListener("click", () => {
      applyTextColor(color.id, updateFormatIndicators);
      closeFormatMenus();
    });
    grid.appendChild(swatch);
  }

  dom.textColorMenu.replaceChildren(grid);

  dom.textColorBtn.addEventListener("mousedown", (e) => e.preventDefault());
  dom.textColorBtn.addEventListener("click", (e) => {
    const isHidden = dom.textColorMenu.classList.contains("hidden");
    closeFormatMenus();
    if (isHidden) {
      dom.textColorMenu.classList.remove("hidden");
      dom.textColorBtn.setAttribute("aria-expanded", "true");
      positionFormatMenu(dom.textColorMenu);
    }
    e.stopPropagation();
  });

  dom.noteArea.addEventListener("beforeinput", handlePendingColorInput);
  document.addEventListener("selectionchange", () => {
    if (pendingTextColor !== undefined && getCaretKey() !== pendingCaretKey) {
      pendingTextColor = undefined;
      pendingCaretKey = null;
    }
  });
}
