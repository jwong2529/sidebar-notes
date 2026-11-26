import { resetEditorHistory } from "./modules/editor-history.js";
import { dom } from "./modules/dom.js";
import { state } from "./modules/state.js";
import { updateStatus, triggerSave, loadStorage } from "./modules/storage.js";
import { initDialogs, closeDeleteConfirmation } from "./modules/dialogs.js";
import { normalizeListRows, initListItems, listItemAtSelection, createListItemMarkup, handleListItemKey, handleParagraphBackspace } from "./modules/list-items.js";
import { initEditor, updateFormatIndicators, closeFormatMenus, positionFormatMenus, positionFormatMenu } from "./modules/editor.js";
import { initImages, closeImageContextMenu } from "./modules/images.js";
import { initTree, renderNoteList, closeNoteMenu, deleteNote } from "./modules/tree.js";
import { handleMarkdownShortcut } from "./modules/markdown.js";
import { updateWordCount, setWordCountEnabled } from "./modules/word-count.js";

export function updateFavoriteButton(note) {
  if (!dom.favoriteBtn) {
    return;
  }
  const isFav = Boolean(note?.favorite);
  dom.favoriteBtn.classList.toggle("favorited", isFav);
  dom.favoriteBtn.title = isFav ? "Unfavorite note" : "Favorite note";
  dom.favoriteBtn.setAttribute("aria-label", dom.favoriteBtn.title);
}

export function selectNote(id) {
  state.editorRevision += 1;
  state.selectedImage = null;
  dom.imageResizeHandle.classList.add("hidden");
  closeImageContextMenu();
  state.activeNoteId = id;
  const note = state.notes.find((n) => n.id === id);
  if (note) {
    dom.noteTitleText.textContent = note.title;
    updateFavoriteButton(note);
    const parser = new DOMParser();
    const doc = parser.parseFromString(note.content || "", "text/html");
    doc.body.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => checkbox.removeAttribute("contenteditable"));
    dom.noteArea.replaceChildren(...doc.body.childNodes);
    if (typeof browser !== "undefined" && browser?.storage?.local) {
      browser.storage.local.set({ activeNoteId: id }).catch(() => {});
    }
  } else {
    dom.noteTitleText.textContent = "Untitled Note";
    updateFavoriteButton(null);
    dom.noteArea.replaceChildren();
  }
  normalizeListRows();
  resetEditorHistory();
  renderNoteList();
  updateFormatIndicators();
  updateWordCount();
}

dom.favoriteBtn.addEventListener("click", () => {
  const note = state.notes.find((n) => n.id === state.activeNoteId);
  if (note) {
    note.favorite = !note.favorite;
    updateFavoriteButton(note);
    renderNoteList();
    triggerSave();
  }
});

function beginTitleRename() {
  const note = state.notes.find((n) => n.id === state.activeNoteId);
  if (note && !document.querySelector(".title-name-input")) {
    dom.noteTitleText.hidden = true;
    const input = document.createElement("input");
    input.className = "inline-name-input title-name-input";
    input.value = note.title || "Untitled Note";
    dom.noteTitleText.parentElement.appendChild(input);
    const finish = (save) => {
      if (!input.isConnected) {
        return;
      }
      const name = input.value.trim();
      input.remove();
      dom.noteTitleText.hidden = false;
      if (save && name) {
        note.title = name;
        dom.noteTitleText.textContent = name;
        renderNoteList();
        triggerSave();
      }
    };
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        finish(true);
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        finish(false);
      }
    });
    input.addEventListener("blur", () => finish(true));
    input.focus();
    input.select();
  }
}

dom.noteTitleText.addEventListener("click", beginTitleRename);
dom.noteTitleText.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    beginTitleRename();
  }
});

export function closeNoteOptionsMenu() {
  if (dom.noteOptionsMenu) {
    dom.noteOptionsMenu.classList.add("hidden");
    dom.noteOptionsBtn.setAttribute("aria-expanded", "false");
  }
}

dom.noteOptionsBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  const isHidden = dom.noteOptionsMenu.classList.contains("hidden");
  closeFormatMenus();
  closeNoteMenu();
  if (isHidden) {
    dom.noteOptionsMenu.classList.remove("hidden");
    dom.noteOptionsBtn.setAttribute("aria-expanded", "true");
    positionFormatMenu(dom.noteOptionsMenu);
  } else {
    closeNoteOptionsMenu();
  }
});

dom.exportBtn.addEventListener("click", () => {
  closeNoteOptionsMenu();
  const note = state.notes.find((n) => n.id === state.activeNoteId);
  const title = (note ? note.title : "notes").replace(/[^a-z0-9]/gi, "_").toLowerCase();
  const clone = dom.noteArea.cloneNode(true);
  clone.querySelectorAll("hr.selected").forEach((hr) => hr.classList.remove("selected"));
  const notesHtml = clone.innerHTML;
  const blob = new Blob([notesHtml], { type: "text/html" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `${title}.html`;
  a.click();

  URL.revokeObjectURL(url);
});

dom.themeBtn.addEventListener("click", () => {
  closeNoteOptionsMenu();
  const isDark = document.body.classList.toggle("dark-theme");
  browser.storage.local.set({ theme: isDark ? "dark" : "light" });
});

dom.wordCountBtn.addEventListener("click", () => {
  closeNoteOptionsMenu();
  const next = !state.showWordCount;
  setWordCountEnabled(next);
  if (typeof browser !== "undefined" && browser?.storage?.local) {
    browser.storage.local.set({ showWordCount: next }).catch(() => {});
  }
});

window.addEventListener("resize", () => {
  positionFormatMenus();
});

document.addEventListener("click", (e) => {
  if (state.pendingDelete) {
    return;
  }
  if (!dom.dropdownMenu.contains(e.target) && e.target !== dom.menuBtn) {
    closeNoteMenu();
  }
  if (!e.target.closest(".format-dropdown-group")) {
    closeFormatMenus();
  }
  if (!e.target.closest(".note-options-group")) {
    closeNoteOptionsMenu();
  }
});

document.addEventListener("keydown", (event) => {
  if (state.pendingDelete && event.key === "Tab") {
    const controls = dom.actionDialogInput.classList.contains("hidden")
      ? [dom.deleteCancelBtn, dom.deleteConfirmBtn]
      : [dom.actionDialogInput, dom.deleteCancelBtn, dom.deleteConfirmBtn];
    const index = controls.indexOf(document.activeElement);
    event.preventDefault();
    controls[(index + (event.shiftKey ? controls.length - 1 : 1)) % controls.length].focus();
    return;
  }
  if (event.key === "Escape" && !dom.deleteConfirmation.classList.contains("hidden")) {
    event.preventDefault();
    closeDeleteConfirmation();
  } else if (event.key === "Escape" && !dom.dropdownMenu.classList.contains("hidden")) {
    event.preventDefault();
    closeNoteMenu();
    dom.menuBtn.focus();
  } else if (event.key === "Escape" && dom.noteOptionsMenu && !dom.noteOptionsMenu.classList.contains("hidden")) {
    event.preventDefault();
    closeNoteOptionsMenu();
    dom.noteOptionsBtn.focus();
  } else if (event.key === "Escape" && (!dom.textStyleMenu.classList.contains("hidden") || !dom.listPickerMenu.classList.contains("hidden") || !dom.moreFormatMenu.classList.contains("hidden") || !dom.textColorMenu?.classList.contains("hidden"))) {
    event.preventDefault();
    closeFormatMenus();
  }
});

initDialogs();
initListItems();
initEditor();
initImages();
initTree(selectNote);

loadStorage().then((result) => {
  selectNote(state.activeNoteId);
  if (result.theme === "dark") {
    document.body.classList.add("dark-theme");
  }
  setWordCountEnabled(Boolean(result.showWordCount));
  updateStatus("Saved");
});

window.noteArea = dom.noteArea;
window.bulletBtn = dom.bulletBtn;
window.numberBtn = dom.numberBtn;
window.todoBtn = dom.todoBtn;
window.triggerSave = triggerSave;
window.selectNote = selectNote;
window.handleTodoKey = handleListItemKey;
window.handleParagraphBackspace = handleParagraphBackspace;
window.todoMarkup = createListItemMarkup;
window.todoAtSelection = listItemAtSelection;
window.handleMarkdownShortcut = handleMarkdownShortcut;
Object.defineProperty(window, "activeNoteId", {
  get() { return state.activeNoteId; },
  set(val) { state.activeNoteId = val; },
  configurable: true
});