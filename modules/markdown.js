import { dom } from "./dom.js";
import { editBlocks } from "./editor-history.js";
import { createListItemElement, normalizeListRows, rowContent, LIST_ITEM_SELECTOR, LIST_PREFIX_SELECTOR } from "./list-items.js";
import { getTopBlock, setCaretToStart, setCaretAfterOffset, isEmptyBlock } from "./range.js";

let lastAutoFormat = null;
let onFormatChange = () => {};

function normalizePoint(node, offset) {
  if (!node) return { node: null, offset: 0 };
  if (node.nodeType === Node.ELEMENT_NODE && node.childNodes.length > 0) {
    if (offset >= node.childNodes.length) {
      const last = node.childNodes[node.childNodes.length - 1];
      if (last.nodeType === Node.TEXT_NODE) {
        return { node: last, offset: last.length };
      }
      return { node: last, offset: last.childNodes ? last.childNodes.length : 0 };
    }
    const target = node.childNodes[offset];
    if (target.nodeType === Node.TEXT_NODE) {
      return { node: target, offset: 0 };
    }
    return { node: target, offset: 0 };
  }
  return { node, offset };
}

function convertToHeading(block, tagName) {
  const heading = document.createElement(tagName);
  if (block.nodeType === Node.ELEMENT_NODE) {
    while (block.firstChild) {
      heading.appendChild(block.firstChild);
    }
  } else if (block.length > 0) {
    heading.appendChild(block.cloneNode(true));
  }
  if (!heading.hasChildNodes() || isEmptyBlock(heading)) {
    heading.replaceChildren(document.createElement("br"));
  }
  block.replaceWith(heading);
  setCaretToStart(heading);
  return heading;
}

function convertToList(block, type, checked = false) {
  const depth = Number(block.dataset ? block.dataset.depth : 0) || 0;
  const row = createListItemElement("", depth, checked, type);
  row.lastChild.remove();
  if (block.nodeType === Node.ELEMENT_NODE) {
    while (block.firstChild) {
      row.appendChild(block.firstChild);
    }
  } else if (block.length > 0) {
    row.appendChild(block.cloneNode(true));
  }
  if (row.childNodes.length === 1) {
    row.appendChild(document.createElement("br"));
  }
  block.replaceWith(row);
  normalizeListRows();
  const content = rowContent(row);
  setCaretToStart(content);
  return row;
}

function insertHorizontalRule(block) {
  const hr = document.createElement("hr");
  const next = document.createElement("div");
  next.appendChild(document.createElement("br"));
  block.replaceWith(hr, next);
  setCaretToStart(next);
  return { hr, next };
}

function handleAutoFormatBackspace(event) {
  if (!lastAutoFormat) return false;
  const selection = window.getSelection();
  if (!selection.rangeCount || !selection.isCollapsed) {
    lastAutoFormat = null;
    return false;
  }
  const range = selection.getRangeAt(0);
  const start = normalizePoint(range.startContainer, range.startOffset);

  const isHr = lastAutoFormat.type === "hr";
  const isList = lastAutoFormat.type === "todo" || lastAutoFormat.type === "bullet" || lastAutoFormat.type === "number";
  const isHeading = lastAutoFormat.type === "h1" || lastAutoFormat.type === "h2";

  if (!isHr && !isList && !isHeading) {
    lastAutoFormat = null;
    return false;
  }

  const target = isHr ? lastAutoFormat.next : lastAutoFormat.element;
  if (!target?.isConnected || (isHr && !lastAutoFormat.hr?.isConnected)) {
    lastAutoFormat = null;
    return false;
  }

  const caretContainer = isList ? rowContent(target) : target;
  if (!caretContainer.contains(start.node)) {
    lastAutoFormat = null;
    return false;
  }

  const preRange = document.createRange();
  preRange.setStart(caretContainer, 0);
  preRange.setEnd(start.node, start.offset);
  if (preRange.toString().length > 0) {
    lastAutoFormat = null;
    return false;
  }

  event.preventDefault();
  const { prefix, hr } = lastAutoFormat;
  const originalTag = lastAutoFormat.originalTag || "div";
  const tagName = originalTag === "h1" || originalTag === "h2" || originalTag === "hr" ? "div" : originalTag;
  lastAutoFormat = null;

  editBlocks(() => {
    if (isHr) {
      hr.remove();
    }
    const block = document.createElement(tagName);
    const textNode = document.createTextNode(prefix);
    block.appendChild(textNode);
    while (caretContainer.firstChild) {
      if (caretContainer.firstChild.nodeName !== "BR" && (!isList || !caretContainer.firstChild.matches?.(LIST_PREFIX_SELECTOR))) {
        block.appendChild(caretContainer.firstChild);
      } else {
        caretContainer.firstChild.remove();
      }
    }
    target.replaceWith(block);
    setCaretAfterOffset(textNode, prefix.length);
    onFormatChange();
  });
  return true;
}

function handleHorizontalRuleBackspace(event) {
  const selection = window.getSelection();
  if (!selection.rangeCount || !selection.isCollapsed) return false;
  const range = selection.getRangeAt(0);
  const start = normalizePoint(range.startContainer, range.startOffset);
  const block = getTopBlock(start.node);
  if (!block || block === dom.noteArea) return false;
  const previous = block.previousElementSibling;
  if (!previous || previous.tagName !== "HR") return false;
  const preRange = document.createRange();
  preRange.setStart(block, 0);
  preRange.setEnd(start.node, start.offset);
  if (preRange.toString().length > 0 || (preRange.cloneContents().querySelector && preRange.cloneContents().querySelector("br, img, video, audio"))) return false;
  event.preventDefault();
  editBlocks(() => {
    previous.remove();
  });
  return true;
}

function handleHorizontalRuleDelete(event) {
  const selection = window.getSelection();
  if (!selection.rangeCount || !selection.isCollapsed) return false;
  const range = selection.getRangeAt(0);
  const start = normalizePoint(range.startContainer, range.startOffset);
  const block = getTopBlock(start.node);
  if (!block || block === dom.noteArea) return false;
  const next = block.nextElementSibling;
  if (!next || next.tagName !== "HR") return false;
  const postRange = document.createRange();
  postRange.selectNodeContents(block);
  postRange.setStart(start.node, start.offset);
  if (postRange.toString().length > 0 || (postRange.cloneContents().querySelector && postRange.cloneContents().querySelector("br, img, video, audio"))) return false;
  event.preventDefault();
  editBlocks(() => {
    next.remove();
  });
  return true;
}

export function handleMarkdownShortcut(event) {
  if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) {
    return false;
  }

  if (event.key === "Backspace") {
    if (handleAutoFormatBackspace(event)) {
      return true;
    }
    if (handleHorizontalRuleBackspace(event)) {
      return true;
    }
    lastAutoFormat = null;
    return false;
  }

  if (event.key === "Delete") {
    if (handleHorizontalRuleDelete(event)) {
      return true;
    }
    lastAutoFormat = null;
    return false;
  }

  if (event.key !== " " && event.key !== "Enter") {
    lastAutoFormat = null;
    return false;
  }

  const selection = window.getSelection();
  if (!selection.rangeCount || !selection.isCollapsed) {
    lastAutoFormat = null;
    return false;
  }

  const range = selection.getRangeAt(0);
  const start = normalizePoint(range.startContainer, range.startOffset);
  const block = getTopBlock(start.node);
  if (!block || block === dom.noteArea) {
    lastAutoFormat = null;
    return false;
  }
  if (block.nodeType === Node.ELEMENT_NODE && block.matches(LIST_ITEM_SELECTOR)) {
    lastAutoFormat = null;
    return false;
  }

  const blockText = block.textContent.trim();
  const isHrTrigger = blockText === "---" || blockText === "***" || blockText === "___";

  if ((event.key === "Enter" || event.key === " ") && isHrTrigger) {
    event.preventDefault();
    editBlocks(() => {
      const { hr, next } = insertHorizontalRule(block);
      lastAutoFormat = {
        type: "hr",
        hr,
        next,
        prefix: blockText,
        originalTag: block.nodeType === Node.ELEMENT_NODE ? block.tagName.toLowerCase() : "div"
      };
      onFormatChange();
    });
    return true;
  }

  if (event.key === "Enter") {
    lastAutoFormat = null;
    return false;
  }

  if (event.key === " ") {
    const preRange = document.createRange();
    preRange.setStart(block, 0);
    preRange.setEnd(start.node, start.offset);
    const cloned = preRange.cloneContents();
    if (cloned.querySelector && cloned.querySelector("br, img, video, audio")) {
      lastAutoFormat = null;
      return false;
    }

    const textBefore = preRange.toString();
    const originalTag = block.nodeType === Node.ELEMENT_NODE ? block.tagName.toLowerCase() : "div";

    if (textBefore === "#") {
      event.preventDefault();
      editBlocks(() => {
        preRange.deleteContents();
        const heading = convertToHeading(block, "h1");
        lastAutoFormat = {
          type: "h1",
          element: heading,
          prefix: "# ",
          originalTag
        };
        onFormatChange();
      });
      return true;
    }

    if (textBefore === "##") {
      event.preventDefault();
      editBlocks(() => {
        preRange.deleteContents();
        const heading = convertToHeading(block, "h2");
        lastAutoFormat = {
          type: "h2",
          element: heading,
          prefix: "## ",
          originalTag
        };
        onFormatChange();
      });
      return true;
    }

    if (textBefore === "[ ]" || textBefore === "[]" || textBefore.toLowerCase() === "[x]") {
      event.preventDefault();
      const isChecked = textBefore.toLowerCase() === "[x]";
      editBlocks(() => {
        preRange.deleteContents();
        const row = convertToList(block, "todo", isChecked);
        lastAutoFormat = {
          type: "todo",
          element: row,
          prefix: textBefore + " ",
          originalTag
        };
        onFormatChange();
      });
      return true;
    }

    if (textBefore === "-" || textBefore === "*") {
      event.preventDefault();
      editBlocks(() => {
        preRange.deleteContents();
        const row = convertToList(block, "bullet", false);
        lastAutoFormat = {
          type: "bullet",
          element: row,
          prefix: textBefore + " ",
          originalTag
        };
        onFormatChange();
      });
      return true;
    }

    const numberMatch = textBefore.match(/^(\d+)[\.\)]$/);
    if (numberMatch) {
      event.preventDefault();
      editBlocks(() => {
        preRange.deleteContents();
        const row = convertToList(block, "number", false);
        lastAutoFormat = {
          type: "number",
          element: row,
          prefix: textBefore + " ",
          originalTag
        };
        onFormatChange();
      });
      return true;
    }

    lastAutoFormat = null;
    return false;
  }

  return false;
}

export function initMarkdownShortcuts({ updateFormatIndicators } = {}) {
  if (updateFormatIndicators) {
    onFormatChange = updateFormatIndicators;
  }
  dom.noteArea.addEventListener("mousedown", () => {
    lastAutoFormat = null;
  });
}
