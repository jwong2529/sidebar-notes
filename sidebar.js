import { dom } from "./modules/dom.js";
import { state } from "./modules/state.js";
import { updateStatus, triggerSave, loadStorage } from "./modules/storage.js";
import { initDialogs, closeDeleteConfirmation } from "./modules/dialogs.js";
import { initListItems, listItemAtSelection, createListItemMarkup, handleListItemKey, handleParagraphBackspace } from "./modules/list-items.js";
import { initEditor, updateFormatIndicators, closeFormatMenus, positionFormatMenus } from "./modules/editor.js";
import { initImages } from "./modules/images.js";
import { initTree, renderNoteList, closeNoteMenu, deleteNote } from "./modules/tree.js";

export function selectNote(id) {
  state.editorRevision += 1;
  state.selectedImage = null;
  dom.imageResizeHandle.classList.add("hidden");
  state.activeNoteId = id;
  const note = state.notes.find((n) => n.id === id);
  if (note) {
    dom.noteTitleText.textContent = note.title;
    const parser = new DOMParser();
    const doc = parser.parseFromString(note.content || "", "text/html");
    doc.body.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => checkbox.removeAttribute("contenteditable"));
    dom.noteArea.replaceChildren(...doc.body.childNodes);
  } else {
    dom.noteTitleText.textContent = "Untitled Note";
    dom.noteArea.replaceChildren();
  }
  renderNoteList();
  updateFormatIndicators();
}

dom.renameBtn.addEventListener("click", () => {
  const note = state.notes.find((n) => n.id === state.activeNoteId);
  if (note && !document.querySelector(".title-name-input")) {
    dom.noteTitleText.hidden = true;
    dom.renameBtn.hidden = true;
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
      dom.renameBtn.hidden = false;
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
});

dom.clearBtn.addEventListener("click", () => {
  const note = state.notes.find((item) => item.id === state.activeNoteId);
  if (note) {
    deleteNote(note, selectNote);
  }
});

dom.exportBtn.addEventListener("click", () => {
  const note = state.notes.find((n) => n.id === state.activeNoteId);
  const title = (note ? note.title : "notes").replace(/[^a-z0-9]/gi, "_").toLowerCase();
  const notesHtml = dom.noteArea.innerHTML;
  const blob = new Blob([notesHtml], { type: "text/html" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `${title}.html`;
  a.click();

  URL.revokeObjectURL(url);
});

dom.themeBtn.addEventListener("click", () => {
  const isDark = document.body.classList.toggle("dark-theme");
  browser.storage.local.set({ theme: isDark ? "dark" : "light" });
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
  } else if (event.key === "Escape" && (!dom.textStyleMenu.classList.contains("hidden") || !dom.listPickerMenu.classList.contains("hidden") || !dom.moreFormatMenu.classList.contains("hidden"))) {
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
  updateStatus("Saved");
});

window.noteArea = dom.noteArea;
window.bulletBtn = dom.bulletBtn;
window.todoBtn = dom.todoBtn;
window.triggerSave = triggerSave;
window.selectNote = selectNote;
window.handleTodoKey = handleListItemKey;
window.handleParagraphBackspace = handleParagraphBackspace;
window.todoMarkup = createListItemMarkup;
window.todoAtSelection = listItemAtSelection;
Object.defineProperty(window, "activeNoteId", {
  get() { return state.activeNoteId; },
  set(val) { state.activeNoteId = val; },
  configurable: true
});