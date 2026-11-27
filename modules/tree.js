import { dom } from "./dom.js";
import { state } from "./state.js";
import { triggerSave } from "./storage.js";
import { beginInlineRename, positionSearchMenu } from "./dialogs.js";
import {
  configureTreeActions,
  normalizeSearchText,
  getNoteSearchText,
  noteMatchesQuery,
  moveNotesToFolder,
  reorderFolder,
  createFolder,
  renameFolder,
  deleteFolder,
  deleteNote,
  addNote,
  toggleNoteFavorite,
  markNotesFavorite
} from "./tree-actions.js";

export {
  normalizeSearchText,
  getNoteSearchText,
  moveNotesToFolder,
  reorderFolder,
  createFolder,
  renameFolder,
  deleteFolder,
  deleteNote,
  addNote
};

const RENAME_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="m10.8 2.8 2.4 2.4M3 13l2.8-.6 7.8-7.8a1.7 1.7 0 0 0-2.4-2.4l-7.8 7.8L3 13z"></path></svg>';
const DELETE_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5h10M6 4.5V3h4v1.5m2 0-.5 8.5h-7L4 4.5m3 2v4m2-4v4"></path></svg>';

let activeSelectNote = () => {};

export function updateFavoriteButton(note) {
  if (!dom.favoriteBtn) {
    return;
  }
  const isFav = Boolean(note?.favorite);
  dom.favoriteBtn.classList.toggle("favorited", isFav);
  dom.favoriteBtn.title = isFav ? "Unfavorite note" : "Favorite note";
  dom.favoriteBtn.setAttribute("aria-label", dom.favoriteBtn.title);
}

function createActionButton({ className = "folder-action-btn", title, iconHtml, onClick }) {
  const button = document.createElement("button");
  button.className = className;
  button.type = "button";
  button.title = title;
  button.setAttribute("aria-label", title);
  button.innerHTML = iconHtml;
  button.addEventListener("click", onClick);
  return button;
}

function createFavoriteIcon(isFavorite) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
  polygon.setAttribute("points", "8 1.5 10.06 5.67 14.67 6.34 11.33 9.59 12.12 14.18 8 12.01 3.88 14.18 4.67 9.59 1.33 6.34 5.94 5.67 8 1.5");
  if (isFavorite) {
    svg.setAttribute("fill", "currentColor");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1");
  } else {
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.3");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
  }
  svg.append(polygon);
  return svg;
}

export function clearNoteSelection() {
  state.selectedNoteIds.clear();
  state.selectionAnchorId = null;
  dom.dropdownItems.querySelectorAll(".note-item").forEach((item) => {
    item.classList.remove("selected-note");
    item.setAttribute("aria-pressed", "false");
  });
}

export function closeNoteMenu() {
  dom.dropdownMenu.classList.add("hidden");
  clearNoteSelection();
  state.draggedNoteId = null;
  state.draggedNoteIds = [];
  state.draggedFolderId = null;
  dom.dropdownItems.querySelectorAll(".dragging, .drop-target, .drop-before, .drop-after, .folder-drop-before, .folder-drop-after").forEach((item) => {
    item.classList.remove("dragging", "drop-target", "drop-before", "drop-after", "folder-drop-before", "folder-drop-after");
  });
}

function handleNoteClick(event, note) {
  event.stopPropagation();
  const additive = event.metaKey || event.ctrlKey;
  if (event.shiftKey) {
    const visibleIds = [...dom.dropdownItems.querySelectorAll(".note-row")].map((r) => r.dataset.noteId);
    const anchor = visibleIds.includes(state.selectionAnchorId) ? state.selectionAnchorId : state.activeNoteId;
    const start = visibleIds.indexOf(anchor);
    const end = visibleIds.indexOf(note.id);
    if (!additive) state.selectedNoteIds.clear();
    visibleIds.slice(start < 0 ? end : Math.min(start, end), start < 0 ? end + 1 : Math.max(start, end) + 1)
      .forEach((id) => state.selectedNoteIds.add(id));
    state.selectionAnchorId = start < 0 ? note.id : anchor;
  } else if (additive) {
    if (state.selectedNoteIds.has(note.id)) {
      state.selectedNoteIds.delete(note.id);
    } else {
      state.selectedNoteIds.add(note.id);
    }
    state.selectionAnchorId = note.id;
  } else {
    activeSelectNote(note.id);
    closeNoteMenu();
  }
  dom.dropdownItems.querySelectorAll(".note-row").forEach((r) => {
    const button = r.querySelector(".note-item");
    const selected = state.selectedNoteIds.has(r.dataset.noteId);
    button.classList.toggle("selected-note", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
}

function createNoteRow(note, isFavoriteSection = false) {
  const row = document.createElement("div");
  row.className = "note-row";
  row.dataset.noteId = note.id;
  row.draggable = true;
  row.addEventListener("dragstart", (event) => {
    if (event.target.closest(".note-actions, .note-fav-btn")) {
      event.preventDefault();
      return;
    }
    state.draggedNoteId = note.id;
    state.draggedNoteIds = state.selectedNoteIds.has(note.id) ? [...state.selectedNoteIds] : [note.id];
    row.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", note.id);
  });
  row.addEventListener("dragend", () => {
    state.draggedNoteId = null;
    state.draggedNoteIds = [];
    row.classList.remove("dragging");
    dom.dropdownItems.querySelectorAll(".drop-target").forEach((target) => target.classList.remove("drop-target"));
    dom.dropdownItems.querySelectorAll(".drop-before, .drop-after").forEach((target) => target.classList.remove("drop-before", "drop-after"));
  });

  if (!isFavoriteSection) {
    row.addEventListener("dragover", (event) => {
      if (!state.draggedNoteId || state.draggedNoteIds.includes(note.id)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "move";
      row.classList.remove("drop-before", "drop-after");
      const rect = row.getBoundingClientRect();
      row.classList.add(event.clientY < rect.top + rect.height / 2 ? "drop-before" : "drop-after");
    });
    row.addEventListener("dragleave", (event) => {
      if (!row.contains(event.relatedTarget)) {
        row.classList.remove("drop-before", "drop-after");
      }
    });
    row.addEventListener("drop", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const rect = row.getBoundingClientRect();
      const after = event.clientY >= rect.top + rect.height / 2;
      moveNotesToFolder(state.draggedNoteIds, note.folderId || "", note.id, after);
    });
  }

  const title = note.title || "Untitled Note";
  const item = document.createElement("button");
  item.className = "dropdown-item note-item";
  if (state.selectedNoteIds.has(note.id)) {
    item.classList.add("selected-note");
    item.setAttribute("aria-pressed", "true");
  }
  if (note.id === state.activeNoteId) {
    item.classList.add("current-note");
    item.setAttribute("aria-current", "true");
  }
  item.textContent = title;
  item.addEventListener("click", (event) => handleNoteClick(event, note));

  const actions = document.createElement("div");
  actions.className = "note-actions";

  const favoriteNoteBtn = document.createElement("button");
  favoriteNoteBtn.className = note.favorite ? "folder-action-btn note-fav-btn favorited" : "folder-action-btn note-fav-btn";
  favoriteNoteBtn.type = "button";
  favoriteNoteBtn.title = note.favorite ? `Unfavorite ${title}` : `Favorite ${title}`;
  favoriteNoteBtn.setAttribute("aria-label", favoriteNoteBtn.title);
  favoriteNoteBtn.append(createFavoriteIcon(Boolean(note.favorite)));
  favoriteNoteBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleNoteFavorite(note);
  });

  const renameNoteBtn = createActionButton({
    title: `Rename ${title}`,
    iconHtml: RENAME_ICON,
    onClick: () => {
      item.hidden = true;
      actions.hidden = true;
      beginInlineRename(row, title, (name) => {
        note.title = name;
        if (note.id === state.activeNoteId) {
          dom.noteTitleText.textContent = note.title;
        }
        renderNoteList();
        triggerSave();
      }, renderNoteList);
    }
  });

  const deleteNoteBtn = createActionButton({
    className: "folder-action-btn danger",
    title: `Delete ${title}`,
    iconHtml: DELETE_ICON,
    onClick: () => deleteNote(note, activeSelectNote)
  });

  actions.append(renameNoteBtn, deleteNoteBtn);
  row.append(favoriteNoteBtn, item, actions);
  return row;
}

function createFolderToggle(label, countText, isCollapsed, collapseKey) {
  const toggle = document.createElement("button");
  toggle.className = collapseKey === "__favorites__" ? "folder-toggle favorites-toggle" : "folder-toggle";
  toggle.setAttribute("aria-expanded", String(!isCollapsed));
  toggle.title = label;
  const nameEl = document.createElement("span");
  nameEl.className = "folder-name";
  nameEl.textContent = label;
  const countEl = document.createElement("span");
  countEl.className = "folder-count";
  countEl.textContent = countText;
  toggle.append(nameEl, countEl);
  toggle.addEventListener("click", () => {
    if (state.collapsedFolders.has(collapseKey)) {
      state.collapsedFolders.delete(collapseKey);
    } else {
      state.collapsedFolders.add(collapseKey);
    }
    renderNoteList();
  });
  return toggle;
}

function createFavoritesGroup(favoriteNotes, matchingFavoriteNotes, query) {
  const isCollapsed = !query && state.collapsedFolders.has("__favorites__");
  const group = document.createElement("section");
  group.className = "note-folder-group favorites-group";
  const heading = document.createElement("div");
  heading.className = "folder-heading favorites-heading";
  heading.addEventListener("dragover", (event) => {
    if (state.draggedNoteIds.length || state.draggedNoteId) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      heading.classList.add("drop-target");
    }
  });
  heading.addEventListener("dragleave", (event) => {
    if (!heading.contains(event.relatedTarget)) {
      heading.classList.remove("drop-target");
    }
  });
  heading.addEventListener("drop", (event) => {
    event.preventDefault();
    event.stopPropagation();
    heading.classList.remove("drop-target");
    const ids = state.draggedNoteIds.length ? state.draggedNoteIds : [state.draggedNoteId];
    markNotesFavorite(ids);
  });

  heading.appendChild(createFolderToggle("Favorites", String(favoriteNotes.length), isCollapsed, "__favorites__"));
  group.appendChild(heading);

  if (!isCollapsed) {
    matchingFavoriteNotes.forEach((note) => {
      group.appendChild(createNoteRow(note, true));
    });
  }
  return group;
}

function createFolderGroup(folder, folderNotes, matchingNotes, isCollapsed) {
  const group = document.createElement("section");
  group.className = folder.id ? "note-folder-group nested-folder" : "note-folder-group";
  const heading = document.createElement("div");
  heading.className = "folder-heading";
  heading.addEventListener("dragover", (event) => {
    if (state.draggedFolderId && state.draggedFolderId !== folder.id && folder.id) {
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "move";
      heading.classList.remove("folder-drop-before", "folder-drop-after");
      const rect = heading.getBoundingClientRect();
      heading.classList.add(event.clientY < rect.top + rect.height / 2 ? "folder-drop-before" : "folder-drop-after");
    } else if (state.draggedNoteIds.length || state.draggedNoteId) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      heading.classList.add("drop-target");
    }
  });
  heading.addEventListener("dragleave", (event) => {
    if (!heading.contains(event.relatedTarget)) {
      heading.classList.remove("drop-target", "folder-drop-before", "folder-drop-after");
    }
  });
  heading.addEventListener("drop", (event) => {
    event.preventDefault();
    event.stopPropagation();
    heading.classList.remove("drop-target");
    if (state.draggedFolderId && folder.id && state.draggedFolderId !== folder.id) {
      const rect = heading.getBoundingClientRect();
      reorderFolder(state.draggedFolderId, folder.id, event.clientY >= rect.top + rect.height / 2);
    } else if (state.draggedNoteIds.length || state.draggedNoteId) {
      moveNotesToFolder(state.draggedNoteIds.length ? state.draggedNoteIds : [state.draggedNoteId], folder.id);
    }
    heading.classList.remove("folder-drop-before", "folder-drop-after");
  });

  const toggle = createFolderToggle(folder.name, String(folderNotes.length), isCollapsed, folder.id);
  toggle.draggable = Boolean(folder.id);
  if (folder.id) {
    toggle.addEventListener("dragstart", (event) => {
      state.draggedFolderId = folder.id;
      event.stopPropagation();
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", `folder:${folder.id}`);
    });
    toggle.addEventListener("dragend", () => {
      state.draggedFolderId = null;
      dom.dropdownItems.querySelectorAll(".folder-drop-before, .folder-drop-after").forEach((target) => target.classList.remove("folder-drop-before", "folder-drop-after"));
    });
  }
  heading.appendChild(toggle);

  if (folder.id) {
    const deleteFolderBtn = createActionButton({
      className: "folder-action-btn danger",
      title: `Delete ${folder.name}`,
      iconHtml: DELETE_ICON,
      onClick: () => deleteFolder(folder)
    });
    const renameFolderBtn = createActionButton({
      title: `Rename ${folder.name}`,
      iconHtml: RENAME_ICON,
      onClick: () => renameFolder(folder, heading, [toggle, renameFolderBtn, deleteFolderBtn])
    });
    heading.append(renameFolderBtn, deleteFolderBtn);
  }
  group.appendChild(heading);

  if (!isCollapsed) {
    matchingNotes.forEach((note) => {
      group.appendChild(createNoteRow(note, false));
    });
  }
  return group;
}

export function renderNoteList() {
  dom.dropdownItems.replaceChildren();
  const query = normalizeSearchText(dom.noteSearch.value);

  const favoriteNotes = state.notes.filter((note) => Boolean(note.favorite));
  const matchingFavoriteNotes = favoriteNotes.filter((note) => noteMatchesQuery(note, query));

  if (matchingFavoriteNotes.length > 0 || (favoriteNotes.length > 0 && !query)) {
    dom.dropdownItems.appendChild(createFavoritesGroup(favoriteNotes, matchingFavoriteNotes, query));
  }

  const groups = [{ id: "", name: "Notes" }, ...state.folders];
  groups.forEach((folder) => {
    const isCollapsed = !query && state.collapsedFolders.has(folder.id);
    const folderNotes = state.notes.filter((note) => (note.folderId || "") === folder.id);
    const matchingNotes = folderNotes.filter((note) => noteMatchesQuery(note, query, folder.name));
    if (matchingNotes.length === 0 && (query || folderNotes.length > 0)) {
      return;
    }
    dom.dropdownItems.appendChild(createFolderGroup(folder, folderNotes, matchingNotes, isCollapsed));
  });
}

configureTreeActions({ renderNoteList, updateFavoriteButton });

export function initTree(selectNoteFn) {
  activeSelectNote = selectNoteFn;

  dom.noteSearch.addEventListener("input", () => {
    clearNoteSelection();
    renderNoteList();
  });

  dom.newFolderBtn.addEventListener("click", createFolder);

  dom.dropdownMenu.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  dom.menuBtn.addEventListener("click", (e) => {
    if (state.pendingDelete) {
      e.stopPropagation();
      return;
    }
    if (dom.dropdownMenu.classList.contains("hidden")) {
      dom.dropdownMenu.classList.remove("hidden");
      positionSearchMenu();
    } else {
      closeNoteMenu();
    }
    e.stopPropagation();
  });

  dom.addBtn.addEventListener("click", () => {
    addNote(selectNoteFn);
    closeNoteMenu();
  });
}
