import { dom } from "./dom.js";
import { state } from "./state.js";
import { updateWordCount } from "./word-count.js";

let saveTimeout = null;
let statusHideTimeout = null;

export function updateStatus(text) {
  clearTimeout(statusHideTimeout);
  dom.statusBar.textContent = text;
  dom.statusBar.classList.add("visible");
  if (text === "Saved") {
    statusHideTimeout = setTimeout(() => {
      dom.statusBar.classList.remove("visible");
    }, 1500);
  }
}

function getLocalStorage() {
  return typeof browser !== "undefined" ? browser?.storage?.local || null : null;
}

export function setStorageValues(values) {
  const local = getLocalStorage();
  if (!local) {
    return Promise.resolve();
  }
  return local.set(values).catch(() => {});
}

export function getCleanNoteHtml() {
  if (!dom.noteArea.querySelector("hr.selected")) {
    return dom.noteArea.innerHTML;
  }
  const clone = dom.noteArea.cloneNode(true);
  clone.querySelectorAll("hr.selected").forEach((hr) => hr.classList.remove("selected"));
  return clone.innerHTML;
}

export function triggerSave() {
  const note = state.notes.find((n) => n.id === state.activeNoteId);
  if (note) {
    const content = getCleanNoteHtml();
    if (note.content !== content) {
      note.content = content;
      state.noteSearchTextCache.delete(note);
    }
  }

  updateWordCount();
  updateStatus("Saving...");

  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }

  saveTimeout = setTimeout(() => {
    const local = getLocalStorage();
    if (!local) {
      updateStatus("Could not save. Your changes are still open.");
      return;
    }
    local.set({ notesList: state.notes, foldersList: state.folders, activeNoteId: state.activeNoteId }).then(() => {
      updateStatus("Saved");
    }).catch(() => {
      updateStatus("Could not save. Your changes are still open.");
    });
  }, 500);
}

export async function loadStorage() {
  const local = getLocalStorage();
  const result = local
    ? await local.get(["notesList", "foldersList", "theme", "activeNoteId", "showWordCount"])
    : {};
  state.folders = result.foldersList || [];
  if (result.notesList && result.notesList.length > 0) {
    state.notes = result.notesList;
    const lastActive = state.notes.find((n) => n.id === result.activeNoteId);
    state.activeNoteId = lastActive ? lastActive.id : state.notes[0].id;
  } else {
    state.notes = [{ id: "default", title: "My Note", content: "", favorite: false }];
    state.activeNoteId = "default";
  }
  return result;
}