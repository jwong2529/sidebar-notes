import { dom } from "./dom.js";
import { state } from "./state.js";
import { triggerSave, updateStatus } from "./storage.js";
import { showActionDialog, beginInlineRename, positionSearchMenu } from "./dialogs.js";

export function normalizeSearchText(text) {
  return text.replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

export function getNoteSearchText(note) {
  if (state.noteSearchTextCache.has(note)) {
    return state.noteSearchTextCache.get(note);
  }
  const template = document.createElement("template");
  template.innerHTML = note.content || "";
  template.content.querySelectorAll("img, script, style, input, svg, video, audio, iframe, object").forEach((element) => element.remove());
  template.content.querySelectorAll("br, div, p, h1, h2, h3, h4, h5, h6, li, ul, ol, blockquote, pre, tr, td, th, section, article, hr").forEach((element) => {
    element.before(document.createTextNode(" "));
    element.after(document.createTextNode(" "));
  });
  const text = normalizeSearchText(template.content.textContent || "");
  state.noteSearchTextCache.set(note, text);
  return text;
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
  renderNoteList();
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
  renderNoteList();
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
    renderNoteList();
    triggerSave();
  }, "");
}

export function renameFolder(folder, heading, controls) {
  controls.forEach((control) => { control.hidden = true; });
  beginInlineRename(heading, folder.name, (name) => {
    if (state.folders.some((item) => item.id !== folder.id && item.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      updateStatus("A folder with that name already exists");
      renderNoteList();
      return;
    }
    folder.name = name;
    renderNoteList();
    triggerSave();
  }, renderNoteList);
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
    renderNoteList();
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
      renderNoteList();
    }
    triggerSave();
  });
}

export function addNote(selectNote) {
  dom.noteSearch.value = "";
  const activeNote = state.notes.find((note) => note.id === state.activeNoteId);
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

let activeSelectNote = () => {};

function createNoteRow(note, isFavoriteSection = false) {
  const row = document.createElement("div");
  row.className = "note-row";
  row.dataset.noteId = note.id;
  row.draggable = true;
  row.addEventListener("dragstart", (event) => {
    if (event.target.closest(".note-actions")) {
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
  item.textContent = note.title || "Untitled Note";

  const actions = document.createElement("div");
  actions.className = "note-actions";

  const favoriteNoteBtn = document.createElement("button");
  favoriteNoteBtn.className = "folder-action-btn favorite-action-btn";
  if (note.favorite) {
    favoriteNoteBtn.classList.add("favorited");
  }
  favoriteNoteBtn.type = "button";
  favoriteNoteBtn.title = note.favorite ? `Unfavorite ${note.title || "Untitled Note"}` : `Favorite ${note.title || "Untitled Note"}`;
  favoriteNoteBtn.setAttribute("aria-label", favoriteNoteBtn.title);
  favoriteNoteBtn.innerHTML = note.favorite
    ? '<svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor" stroke="currentColor" stroke-width="1"><polygon points="8 1.5 10.06 5.67 14.67 6.34 11.33 9.59 12.12 14.18 8 12.01 3.88 14.18 4.67 9.59 1.33 6.34 5.94 5.67 8 1.5"></polygon></svg>'
    : '<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><polygon points="8 1.5 10.06 5.67 14.67 6.34 11.33 9.59 12.12 14.18 8 12.01 3.88 14.18 4.67 9.59 1.33 6.34 5.94 5.67 8 1.5"></polygon></svg>';
  favoriteNoteBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    note.favorite = !note.favorite;
    if (note.id === state.activeNoteId && dom.favoriteBtn) {
      dom.favoriteBtn.classList.toggle("favorited", Boolean(note.favorite));
      dom.favoriteBtn.title = note.favorite ? "Unfavorite note" : "Favorite note";
      dom.favoriteBtn.setAttribute("aria-label", dom.favoriteBtn.title);
    }
    renderNoteList();
    triggerSave();
  });

  const renameNoteBtn = document.createElement("button");
  renameNoteBtn.className = "folder-action-btn";
  renameNoteBtn.type = "button";
  renameNoteBtn.title = `Rename ${note.title || "Untitled Note"}`;
  renameNoteBtn.setAttribute("aria-label", `Rename ${note.title || "Untitled Note"}`);
  renameNoteBtn.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="m10.8 2.8 2.4 2.4M3 13l2.8-.6 7.8-7.8a1.7 1.7 0 0 0-2.4-2.4l-7.8 7.8L3 13z"></path></svg>';
  renameNoteBtn.addEventListener("click", () => {
    item.hidden = true;
    actions.hidden = true;
    beginInlineRename(row, note.title || "Untitled Note", (name) => {
      note.title = name;
      if (note.id === state.activeNoteId) {
        dom.noteTitleText.textContent = note.title;
      }
      renderNoteList();
      triggerSave();
    }, renderNoteList);
  });

  const deleteNoteBtn = document.createElement("button");
  deleteNoteBtn.className = "folder-action-btn danger";
  deleteNoteBtn.type = "button";
  deleteNoteBtn.title = `Delete ${note.title || "Untitled Note"}`;
  deleteNoteBtn.setAttribute("aria-label", `Delete ${note.title || "Untitled Note"}`);
  deleteNoteBtn.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5h10M6 4.5V3h4v1.5m2 0-.5 8.5h-7L4 4.5m3 2v4m2-4v4"></path></svg>';
  deleteNoteBtn.addEventListener("click", () => deleteNote(note, activeSelectNote));

  actions.append(favoriteNoteBtn, renameNoteBtn, deleteNoteBtn);

  item.addEventListener("click", (event) => {
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
  });

  row.append(item, actions);
  return row;
}

export function renderNoteList() {
  dom.dropdownItems.replaceChildren();
  const query = normalizeSearchText(dom.noteSearch.value);

  const favoriteNotes = state.notes.filter((note) => Boolean(note.favorite));
  const matchingFavoriteNotes = favoriteNotes.filter((note) =>
    !query || normalizeSearchText(note.title || "Untitled Note").includes(query) || getNoteSearchText(note).includes(query)
  );

  if (matchingFavoriteNotes.length > 0 || (favoriteNotes.length > 0 && !query)) {
    const isFavoritesCollapsed = !query && state.collapsedFolders.has("__favorites__");
    const favGroup = document.createElement("section");
    favGroup.className = "note-folder-group favorites-group";
    const favHeading = document.createElement("div");
    favHeading.className = "folder-heading favorites-heading";
    favHeading.addEventListener("dragover", (event) => {
      if (state.draggedNoteIds.length || state.draggedNoteId) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        favHeading.classList.add("drop-target");
      }
    });
    favHeading.addEventListener("dragleave", (event) => {
      if (!favHeading.contains(event.relatedTarget)) {
        favHeading.classList.remove("drop-target");
      }
    });
    favHeading.addEventListener("drop", (event) => {
      event.preventDefault();
      event.stopPropagation();
      favHeading.classList.remove("drop-target");
      const ids = state.draggedNoteIds.length ? state.draggedNoteIds : [state.draggedNoteId];
      ids.forEach((id) => {
        const n = state.notes.find((item) => item.id === id);
        if (n) {
          n.favorite = true;
          if (n.id === state.activeNoteId && dom.favoriteBtn) {
            dom.favoriteBtn.classList.add("favorited");
            dom.favoriteBtn.title = "Unfavorite note";
            dom.favoriteBtn.setAttribute("aria-label", dom.favoriteBtn.title);
          }
        }
      });
      state.draggedNoteId = null;
      state.draggedNoteIds = [];
      renderNoteList();
      triggerSave();
    });

    const favToggle = document.createElement("button");
    favToggle.className = "folder-toggle favorites-toggle";
    favToggle.setAttribute("aria-expanded", String(!isFavoritesCollapsed));
    const favIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    favIcon.setAttribute("viewBox", "0 0 16 16");
    favIcon.setAttribute("aria-hidden", "true");
    favIcon.setAttribute("fill", "currentColor");
    favIcon.setAttribute("stroke", "currentColor");
    favIcon.setAttribute("stroke-width", "1");
    favIcon.classList.add("favorites-icon");
    favIcon.innerHTML = '<polygon points="8 1.5 10.06 5.67 14.67 6.34 11.33 9.59 12.12 14.18 8 12.01 3.88 14.18 4.67 9.59 1.33 6.34 5.94 5.67 8 1.5"></polygon>';
    const favName = document.createElement("span");
    favName.className = "folder-name";
    favName.textContent = "Favorites";
    favToggle.title = "Favorites";
    favToggle.append(favIcon, favName);

    const favCount = document.createElement("span");
    favCount.className = "folder-count";
    favCount.textContent = String(favoriteNotes.length);
    favToggle.appendChild(favCount);

    favToggle.addEventListener("click", () => {
      if (state.collapsedFolders.has("__favorites__")) {
        state.collapsedFolders.delete("__favorites__");
      } else {
        state.collapsedFolders.add("__favorites__");
      }
      renderNoteList();
    });
    favHeading.appendChild(favToggle);
    favGroup.appendChild(favHeading);

    if (!isFavoritesCollapsed) {
      matchingFavoriteNotes.forEach((note) => {
        favGroup.appendChild(createNoteRow(note, true));
      });
    }
    dom.dropdownItems.appendChild(favGroup);
  }

  const groups = [{ id: "", name: "Notes" }, ...state.folders];

  groups.forEach((folder) => {
    const isCollapsed = !query && state.collapsedFolders.has(folder.id);
    const folderNotes = state.notes.filter((note) => (note.folderId || "") === folder.id);
    const matchingNotes = folderNotes.filter((note) =>
      !query || normalizeSearchText(note.title || "Untitled Note").includes(query) || normalizeSearchText(folder.name).includes(query) || getNoteSearchText(note).includes(query)
    );
    if (matchingNotes.length === 0 && (query || folderNotes.length > 0)) {
      return;
    }

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
        heading.classList.remove("drop-target");
        heading.classList.remove("folder-drop-before", "folder-drop-after");
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

    const toggle = document.createElement("button");
    toggle.className = "folder-toggle";
    toggle.setAttribute("aria-expanded", String(!isCollapsed));
    const folderName = document.createElement("span");
    folderName.className = "folder-name";
    folderName.textContent = folder.name;
    toggle.title = folder.name;
    toggle.appendChild(folderName);
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
    const count = document.createElement("span");
    count.className = "folder-count";
    count.textContent = String(folderNotes.length);
    toggle.appendChild(count);
    toggle.addEventListener("click", () => {
      if (state.collapsedFolders.has(folder.id)) {
        state.collapsedFolders.delete(folder.id);
      } else {
        state.collapsedFolders.add(folder.id);
      }
      renderNoteList();
    });
    heading.appendChild(toggle);

    if (folder.id) {
      const renameFolderBtn = document.createElement("button");
      renameFolderBtn.className = "folder-action-btn";
      renameFolderBtn.type = "button";
      renameFolderBtn.title = `Rename ${folder.name}`;
      renameFolderBtn.setAttribute("aria-label", `Rename ${folder.name}`);
      renameFolderBtn.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="m10.8 2.8 2.4 2.4M3 13l2.8-.6 7.8-7.8a1.7 1.7 0 0 0-2.4-2.4l-7.8 7.8L3 13z"></path></svg>';
      renameFolderBtn.addEventListener("click", () => renameFolder(folder, heading, [toggle, renameFolderBtn, deleteFolderBtn]));
      heading.appendChild(renameFolderBtn);

      const deleteFolderBtn = document.createElement("button");
      deleteFolderBtn.className = "folder-action-btn danger";
      deleteFolderBtn.type = "button";
      deleteFolderBtn.title = `Delete ${folder.name}`;
      deleteFolderBtn.setAttribute("aria-label", `Delete ${folder.name}`);
      deleteFolderBtn.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5h10M6 4.5V3h4v1.5m2 0-.5 8.5h-7L4 4.5m3 2v4m2-4v4"></path></svg>';
      deleteFolderBtn.addEventListener("click", () => deleteFolder(folder));
      heading.appendChild(deleteFolderBtn);
    }
    group.appendChild(heading);

    if (!isCollapsed) {
      matchingNotes.forEach((note) => {
        group.appendChild(createNoteRow(note, false));
      });
    }
    dom.dropdownItems.appendChild(group);
  });
}

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