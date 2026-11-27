import { dom } from "./dom.js";
import { editBlocks } from "./editor-history.js";
import { linkify } from "./links.js";
import { getEditorRange, collapseSelection } from "./range.js";
import {
  LIST_ITEM_REGISTRY,
  LIST_ITEM_SELECTOR,
  LIST_PREFIX_SELECTOR,
  getListItemType,
  bulletMarker,
  createListItemElement,
  normalizeListRows,
  rowContent,
  emptyContent,
  ensureContent,
  selectionBlock
} from "./list-model.js";

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

function sanitizePastedListHtml(doc) {
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
}

export function initListClipboard({ deleteBlockSelection }) {
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
    sanitizePastedListHtml(doc);
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
          collapseSelection(target, offset);
        } else collapseSelection(last, last.length);
      } else {
        range.deleteContents();
        const fragment = document.createDocumentFragment();
        fragment.append(...nodes);
        range.insertNode(fragment);
        normalizeListRows();
        const last = nodes[nodes.length - 1];
        const target = last.nodeType === Node.ELEMENT_NODE ? rowContent(last) : last;
        collapseSelection(target, target.nodeType === Node.TEXT_NODE ? target.length : target.childNodes.length);
      }
      linkify(dom.noteArea, true);
    });
  });
}
