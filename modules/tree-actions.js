import { dom } from "./dom.js";
import { state, getActiveNote, getNote } from "./state.js";
import { triggerSave, updateStatus } from "./storage.js";
import { showActionDialog, beginInlineRename } from "./dialogs.js";

let onTreeRender = () => {};
let onFavoriteButtonSync = () => {};

export function configureTreeActions({ renderNoteList, updateFavoriteButton }) {
  if (renderNoteList) onTreeRender = renderNoteList;
  if (updateFavoriteButton) onFavoriteButtonSync = updateFavoriteButton;
}

export function normalizeSearchText(text) {
  return text.replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

export function getNoteSearchText(note) {
  if (state.noteSearchTextCache.has(note)) {
    return state.noteSearchTextCache.get(note);
  }
  const doc = new DOMParser().parseFromString(note.content || "", "text/html");
  doc.body.querySelectorAll("img, script, style, input, svg, video, audio, iframe, object").forEach((element) => element.remove());
  doc.body.querySelectorAll("br, div, p, h1, h2, h3, h4, h5, h6, li, ul, ol, blockquote, pre, tr, td, th, section, article, hr").forEach((element) => {
    element.before(document.createTextNode(" "));
    element.after(document.createTextNode(" "));
  });
  const text = normalizeSearchText(doc.body.textContent || "");
  state.noteSearchTextCache.set(note, text);
  return text;
}

export function noteMatchesQuery(note, query, folderName = "") {
  if (!query) return true;
  if (normalizeSearchText(note.title || "Untitled Note").includes(query)) return true;
  if (folderName && normalizeSearchText(folderName).includes(query)) return true;
  return getNoteSearchText(note).includes(query);
}

export function moveNotesToFolder(noteIds, folderId, targetNoteId = null, after = true) {
  const ids = new Set(noteIds);
  const movingNotes = state.notes.filter((note) => ids.has(note.id));
  if (movingNotes.length === 0 || ids.has(targetNoteId) || (targetNoteId && !state.notes.some((note) => note.id === targetNoteId))) {
    return;
  }
  state.notes = state.notes.filter((note) => !ids.has(note.id));
  movingNotes.forEach((note) => {
    note.folderId = folderId;
    state.selectedNoteIds.delete(note.id);
  });
  state.selectionAnchorId = null;
  const lastFolderIndex = state.notes.map((note) => note.folderId || "").lastIndexOf(folderId);
  const insertionIndex = targetNoteId ? state.notes.findIndex((note) => note.id === targetNoteId) + (after ? 1 : 0) : lastFolderIndex + 1;
  state.notes.splice(insertionIndex, 0, ...movingNotes);
  state.draggedNoteId = null;
  state.draggedNoteIds = [];
  onTreeRender();
  triggerSave();
}

export function reorderFolder(folderId, targetFolderId, after) {
  const sourceIndex = state.folders.findIndex((folder) => folder.id === folderId);
  const targetIndex = state.folders.findIndex((folder) => folder.id === targetFolderId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
    return;
  }
  const [folder] = state.folders.splice(sourceIndex, 1);
  state.draggedFolderId = null;
  const adjustedTargetIndex = state.folders.findIndex((item) => item.id === targetFolderId);
  state.folders.splice(adjustedTargetIndex + (after ? 1 : 0), 0, folder);
  onTreeRender();
  triggerSave();
}

export function createFolder() {
  showActionDialog("New folder", "Enter a name for this folder.", (name) => {
    if (!name) {
      return;
    }
    if (state.folders.some((folder) => folder.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      updateStatus("A folder with that name already exists");
      return;
    }
    const folder = { id: `folder-${Date.now()}`, name };
    state.folders.push(folder);
    state.collapsedFolders.delete(folder.id);
    dom.noteSearch.value = "";
    onTreeRender();
    triggerSave();
  }, "");
}

export function renameFolder(folder, heading, controls) {
  controls.forEach((control) => { control.hidden = true; });
  beginInlineRename(heading, folder.name, (name) => {
    if (state.folders.some((item) => item.id !== folder.id && item.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      updateStatus("A folder with that name already exists");
      onTreeRender();
      return;
    }
    folder.name = name;
    onTreeRender();
    triggerSave();
  }, onTreeRender);
}

export function deleteFolder(folder) {
  showActionDialog("Delete folder?", `Delete “${folder.name}”? Its notes will stay in Notes.`, () => {
    state.notes.forEach((note) => {
      if (note.folderId === folder.id) {
        note.folderId = "";
      }
    });
    state.folders = state.folders.filter((item) => item.id !== folder.id);
    state.collapsedFolders.delete(folder.id);
    onTreeRender();
    triggerSave();
  });
}

export function deleteNote(note, selectNote) {
  showActionDialog("Delete note?", `Delete “${note.title || "Untitled Note"}”?`, () => {
    state.selectedNoteIds.delete(note.id);
    state.notes = state.notes.filter((item) => item.id !== note.id);
    if (state.notes.length === 0) {
      state.notes = [{ id: "default", title: "My Note", content: "", folderId: "", favorite: false }];
    }
    if (note.id === state.activeNoteId) {
      selectNote(state.notes[0].id);
    } else {
      onTreeRender();
    }
    triggerSave();
  });
}

export function addNote(selectNote) {
  dom.noteSearch.value = "";
  const activeNote = getActiveNote();
  const newNote = {
    id: Date.now().toString(),
    title: "Untitled Note",
    content: "",
    folderId: activeNote ? activeNote.folderId || "" : "",
    favorite: false
  };
  state.notes.push(newNote);
  selectNote(newNote.id);
  triggerSave();
}

export function toggleNoteFavorite(note) {
  note.favorite = !note.favorite;
  if (note.id === state.activeNoteId) {
    onFavoriteButtonSync(note);
  }
  onTreeRender();
  triggerSave();
}

export function markNotesFavorite(noteIds) {
  noteIds.forEach((id) => {
    const note = getNote(id);
    if (note) {
      note.favorite = true;
      if (note.id === state.activeNoteId) {
        onFavoriteButtonSync(note);
      }
    }
  });
  state.draggedNoteId = null;
  state.draggedNoteIds = [];
  onTreeRender();
  triggerSave();
}
