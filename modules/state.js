export const state = {
  notes: [],
  folders: [],
  activeNoteId: null,
  selectedImage: null,
  draggedNoteId: null,
  draggedNoteIds: [],
  draggedFolderId: null,
  pendingDelete: null,
  dialogAnchor: null,
  dialogReturnFocus: null,
  editorRevision: 0,
  collapsedFolders: new Set(),
  selectedNoteIds: new Set(),
  selectionAnchorId: null,
  noteSearchTextCache: new WeakMap()
};

export function getActiveNote() {
  return state.notes.find((note) => note.id === state.activeNoteId) || null;
}

export function getNote(id) {
  return state.notes.find((note) => note.id === id) || null;
}