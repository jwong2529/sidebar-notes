import { dom } from "./dom.js";
import { editBlocks } from "./editor-history.js";
import { updateFormatIndicators } from "./editor.js";
import { createListItemElement, normalizeListRows, rowContent, LIST_ITEM_SELECTOR } from "./list-items.js";

let lastAutoFormat = null;

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

function getTopBlock(node) {
  if (!node || !dom.noteArea.contains(node) || node === dom.noteArea) return null;
  while (node.parentElement && node.parentElement !== dom.noteArea) {
    node = node.parentElement;
  }
  return node;
}

function setCaretToStart(element) {
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

function setCaretToEnd(element) {
  dom.noteArea.focus();
  const selection = window.getSelection();
  const range = document.createRange();
  if (element.lastChild && element.lastChild.nodeType === Node.TEXT_NODE) {
    range.setStart(element.lastChild, element.lastChild.length);
  } else {
    range.selectNodeContents(element);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    return;
  }
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function setCaretAfterOffset(node, offset) {
  dom.noteArea.focus();
  const selection = window.getSelection();
  const range = document.createRange();
  range.setStart(node, Math.min(offset, node.length));
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
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
  if (!heading.hasChildNodes() || (!heading.textContent.length && !heading.querySelector("br, img, video, audio"))) {
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

  if (lastAutoFormat.type === "h1" || lastAutoFormat.type === "h2") {
    if (!lastAutoFormat.element.isConnected || !lastAutoFormat.element.contains(start.node)) {
      lastAutoFormat = null;
      return false;
    }
    const preRange = document.createRange();
    preRange.setStart(lastAutoFormat.element, 0);
    preRange.setEnd(start.node, start.offset);
    if (preRange.toString().length > 0) {
      lastAutoFormat = null;
      return false;
    }
    event.preventDefault();
    const heading = lastAutoFormat.element;
    const prefix = lastAutoFormat.prefix;
    const originalTag = lastAutoFormat.originalTag || "div";
    lastAutoFormat = null;
    editBlocks(() => {
      const block = document.createElement(originalTag === "h1" || originalTag === "h2" ? "div" : originalTag);
      const textNode = document.createTextNode(prefix);
      block.appendChild(textNode);
      while (heading.firstChild) {
        if (heading.firstChild.nodeName !== "BR") {
          block.appendChild(heading.firstChild);
        } else {
          heading.firstChild.remove();
        }
      }
      heading.replaceWith(block);
      setCaretAfterOffset(textNode, prefix.length);
      updateFormatIndicators();
    });
    return true;
  }

  if (lastAutoFormat.type === "todo" || lastAutoFormat.type === "bullet") {
    if (!lastAutoFormat.element.isConnected) {
      lastAutoFormat = null;
      return false;
    }
    const content = rowContent(lastAutoFormat.element);
    if (!content.contains(start.node)) {
      lastAutoFormat = null;
      return false;
    }
    const preRange = document.createRange();
    preRange.setStart(content, 0);
    preRange.setEnd(start.node, start.offset);
    if (preRange.toString().length > 0) {
      lastAutoFormat = null;
      return false;
    }
    event.preventDefault();
    const row = lastAutoFormat.element;
    const prefix = lastAutoFormat.prefix;
    const originalTag = lastAutoFormat.originalTag || "div";
    lastAutoFormat = null;
    editBlocks(() => {
      const block = document.createElement(originalTag === "h1" || originalTag === "h2" ? "div" : originalTag);
      const textNode = document.createTextNode(prefix);
      block.appendChild(textNode);
      while (content.firstChild) {
        if (content.firstChild.nodeName !== "BR") {
          block.appendChild(content.firstChild);
        } else {
          content.firstChild.remove();
        }
      }
      row.replaceWith(block);
      setCaretAfterOffset(textNode, prefix.length);
      updateFormatIndicators();
    });
    return true;
  }

  if (lastAutoFormat.type === "hr") {
    if (!lastAutoFormat.hr.isConnected || !lastAutoFormat.next.isConnected) {
      lastAutoFormat = null;
      return false;
    }
    if (!lastAutoFormat.next.contains(start.node)) {
      lastAutoFormat = null;
      return false;
    }
    const preRange = document.createRange();
    preRange.setStart(lastAutoFormat.next, 0);
    preRange.setEnd(start.node, start.offset);
    if (preRange.toString().length > 0) {
      lastAutoFormat = null;
      return false;
    }
    event.preventDefault();
    const hr = lastAutoFormat.hr;
    const next = lastAutoFormat.next;
    const prefix = lastAutoFormat.prefix;
    const originalTag = lastAutoFormat.originalTag || "div";
    lastAutoFormat = null;
    editBlocks(() => {
      hr.remove();
      const block = document.createElement(originalTag === "hr" ? "div" : originalTag);
      const textNode = document.createTextNode(prefix);
      block.appendChild(textNode);
      while (next.firstChild) {
        if (next.firstChild.nodeName !== "BR") {
          block.appendChild(next.firstChild);
        } else {
          next.firstChild.remove();
        }
      }
      next.replaceWith(block);
      setCaretAfterOffset(textNode, prefix.length);
      updateFormatIndicators();
    });
    return true;
  }

  lastAutoFormat = null;
  return false;
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

  if (event.key === "Enter" && isHrTrigger) {
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
      updateFormatIndicators();
    });
    return true;
  }

  if (event.key === "Enter") {
    lastAutoFormat = null;
    return false;
  }

  if (event.key === " ") {
    if (isHrTrigger) {
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
        updateFormatIndicators();
      });
      return true;
    }

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
        updateFormatIndicators();
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
        updateFormatIndicators();
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
        updateFormatIndicators();
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
        updateFormatIndicators();
      });
      return true;
    }

    lastAutoFormat = null;
    return false;
  }

  return false;
}

export function initMarkdownShortcuts() {
  dom.noteArea.addEventListener("mousedown", () => {
    lastAutoFormat = null;
  });
}
