import { dom } from "./dom.js";
import { state } from "./state.js";

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

export function triggerSave() {
  const note = state.notes.find((n) => n.id === state.activeNoteId);
  if (note) {
    const content = dom.noteArea.innerHTML;
    if (note.content !== content) {
      note.content = content;
      state.noteSearchTextCache.delete(note);
    }
  }

  updateStatus("Saving...");

  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }

  saveTimeout = setTimeout(() => {
    browser.storage.local.set({ notesList: state.notes, foldersList: state.folders, activeNoteId: state.activeNoteId }).then(() => {
      updateStatus("Saved");
    }).catch(() => {
      updateStatus("Could not save. Your changes are still open.");
    });
  }, 500);
}

export async function loadStorage() {
  const result = await browser.storage.local.get(["notesList", "foldersList", "theme", "activeNoteId"]);
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