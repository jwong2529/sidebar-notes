import { initLinks } from "./links.js";
import { initEditorHistory, editBlocks } from "./editor-history.js";
import { dom } from "./dom.js";
import { triggerSave } from "./storage.js";
import { listItemAtSelection, getListItemType, toggleListItem, handleParagraphBackspace, handleListItemKey, changeDepth } from "./list-items.js";
import { initMarkdownShortcuts, handleMarkdownShortcut } from "./markdown.js";

export function closeFormatMenus() {
  dom.textStyleMenu.classList.add("hidden");
  dom.textStyleBtn.setAttribute("aria-expanded", "false");
  dom.listPickerMenu.classList.add("hidden");
  dom.listPickerBtn.setAttribute("aria-expanded", "false");
  dom.moreFormatMenu.classList.add("hidden");
  dom.moreFormatBtn.setAttribute("aria-expanded", "false");
  if (dom.noteOptionsMenu) {
    dom.noteOptionsMenu.classList.add("hidden");
    dom.noteOptionsBtn.setAttribute("aria-expanded", "false");
  }
}

export function positionFormatMenu(menu) {
  if (menu.classList.contains("hidden")) return;
  menu.style.left = "";
  menu.style.right = "";
  const rect = menu.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  if (rect.right > viewportWidth - 8) {
    menu.style.left = "auto";
    menu.style.right = "0";
  }
  const updatedRect = menu.getBoundingClientRect();
  if (updatedRect.left < 8) {
    menu.style.left = "0";
    menu.style.right = "auto";
  }
}

export function positionFormatMenus() {
  [dom.textStyleMenu, dom.listPickerMenu, dom.moreFormatMenu, dom.noteOptionsMenu].filter(Boolean).forEach(positionFormatMenu);
}

export function updateFormatIndicators() {
  dom.boldBtn.classList.toggle("active", document.queryCommandState("bold"));
  dom.italicBtn.classList.toggle("active", document.queryCommandState("italic"));
  const isUnderline = document.queryCommandState("underline");
  const isStrike = document.queryCommandState("strikeThrough");
  dom.underlineBtn.classList.toggle("active", isUnderline);
  dom.strikeBtn.classList.toggle("active", isStrike);
  dom.moreFormatBtn.classList.toggle("active", isUnderline || isStrike);

  let blockValue = document.queryCommandValue("formatBlock") || "";
  blockValue = blockValue.toLowerCase();

  const currentListItem = listItemAtSelection();
  const listType = currentListItem ? getListItemType(currentListItem) : null;
  dom.bulletBtn.classList.toggle("active", listType === "bullet");
  dom.todoBtn.classList.toggle("active", listType === "todo");
  dom.listPickerBtn.classList.toggle("active", Boolean(listType));

  const isH1 = blockValue === "h1";
  const isH2 = blockValue === "h2";
  const isP = !listType && (blockValue === "p" || blockValue === "div" || blockValue === "");
  dom.pBtn.classList.toggle("active", isP);
  dom.h1Btn.classList.toggle("active", isH1);
  dom.h2Btn.classList.toggle("active", isH2);

  if (isH1) {
    dom.textStyleLabel.textContent = "Heading 1";
  } else if (isH2) {
    dom.textStyleLabel.textContent = "Heading 2";
  } else {
    dom.textStyleLabel.textContent = "Normal";
  }
  updateHorizontalRuleSelection();
}

export function updateHorizontalRuleSelection() {
  const selection = window.getSelection();
  const hrs = dom.noteArea.querySelectorAll("hr");
  if (!hrs.length) return;
  if (!selection.rangeCount || selection.isCollapsed) {
    hrs.forEach((hr) => hr.classList?.remove("selected"));
    return;
  }
  const range = selection.getRangeAt(0);
  hrs.forEach((hr) => {
    const isSelected = typeof range.intersectsNode === "function" ? range.intersectsNode(hr) : false;
    hr.classList?.toggle("selected", isSelected);
  });
}

export function format(command, value = null) {
  document.execCommand(command, false, value);
  dom.noteArea.focus();
  updateFormatIndicators();
  triggerSave();
}

export function initEditor() {
  initLinks();
  initEditorHistory();
  initMarkdownShortcuts();
  [dom.textStyleBtn, dom.listPickerBtn, dom.moreFormatBtn, dom.pBtn, dom.h1Btn, dom.h2Btn, dom.underlineBtn, dom.strikeBtn].forEach((element) => {
    element.addEventListener("mousedown", (e) => e.preventDefault());
  });

  dom.textStyleBtn.addEventListener("click", (e) => {
    const isHidden = dom.textStyleMenu.classList.contains("hidden");
    closeFormatMenus();
    if (isHidden) {
      dom.textStyleMenu.classList.remove("hidden");
      dom.textStyleBtn.setAttribute("aria-expanded", "true");
      positionFormatMenu(dom.textStyleMenu);
    }
    e.stopPropagation();
  });

  dom.listPickerBtn.addEventListener("click", (e) => {
    const isHidden = dom.listPickerMenu.classList.contains("hidden");
    closeFormatMenus();
    if (isHidden) {
      dom.listPickerMenu.classList.remove("hidden");
      dom.listPickerBtn.setAttribute("aria-expanded", "true");
      positionFormatMenu(dom.listPickerMenu);
    }
    e.stopPropagation();
  });

  dom.moreFormatBtn.addEventListener("click", (e) => {
    const isHidden = dom.moreFormatMenu.classList.contains("hidden");
    closeFormatMenus();
    if (isHidden) {
      dom.moreFormatMenu.classList.remove("hidden");
      dom.moreFormatBtn.setAttribute("aria-expanded", "true");
      positionFormatMenu(dom.moreFormatMenu);
    }
    e.stopPropagation();
  });

  dom.boldBtn.addEventListener("click", () => format("bold"));
  dom.italicBtn.addEventListener("click", () => format("italic"));
  dom.underlineBtn.addEventListener("click", () => {
    format("underline");
    closeFormatMenus();
  });
  dom.strikeBtn.addEventListener("click", () => {
    format("strikeThrough");
    closeFormatMenus();
  });
  dom.pBtn.addEventListener("click", () => {
    format("formatBlock", "p");
    closeFormatMenus();
  });
  dom.h1Btn.addEventListener("click", () => {
    format("formatBlock", "h1");
    closeFormatMenus();
  });
  dom.h2Btn.addEventListener("click", () => {
    format("formatBlock", "h2");
    closeFormatMenus();
  });

  dom.bulletBtn.addEventListener("click", () => {
    toggleListItem("bullet");
    closeFormatMenus();
  });
  dom.todoBtn.addEventListener("click", () => {
    toggleListItem("todo");
    closeFormatMenus();
  });

  dom.noteArea.addEventListener("keyup", updateFormatIndicators);
  dom.noteArea.addEventListener("mouseup", updateFormatIndicators);
  dom.noteArea.addEventListener("focus", updateFormatIndicators);
  dom.noteArea.addEventListener("blur", () => {
    dom.noteArea.querySelectorAll("hr.selected").forEach((hr) => hr.classList?.remove("selected"));
  });
  document.addEventListener("selectionchange", () => {
    if (document.activeElement === dom.noteArea) {
      updateFormatIndicators();
    }
  });

  dom.noteArea.addEventListener("keydown", (e) => {
    if (handleMarkdownShortcut(e)) return;
    if (handleParagraphBackspace(e)) return;
    if (handleListItemKey(e)) return;
    if (e.key === "Tab" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.shiftKey) {
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          const element = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement;
          const block = element?.closest("div, p, h1, h2");
          if (block && block !== dom.noteArea && Number(block.dataset.depth) > 0) {
            e.preventDefault();
            editBlocks(() => changeDepth(block, -1));
          }
        }
        return;
      }
      e.preventDefault();
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        if (range.collapsed) {
          if (!document.execCommand("insertText", false, "\t")) {
            const tabNode = document.createTextNode("\t");
            range.insertNode(tabNode);
            range.setStartAfter(tabNode);
            range.setEndAfter(tabNode);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }
      }
      triggerSave();
      return;
    }
    if (e.metaKey || e.ctrlKey) {
      if (e.key === "b" || e.key === "B") {
        e.preventDefault();
        format("bold");
      } else if (e.key === "i" || e.key === "I") {
        e.preventDefault();
        format("italic");
      } else if (e.key === "u" || e.key === "U") {
        e.preventDefault();
        format("underline");
      }
    }
  });

  dom.noteArea.addEventListener("input", triggerSave);
}