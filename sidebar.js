const noteArea = document.getElementById("note-area");
const editorPane = document.querySelector(".editor-pane");
const imageResizeHandle = document.getElementById("image-resize-handle");
const deleteConfirmation = document.getElementById("delete-confirmation");
const deleteConfirmTitle = document.getElementById("delete-confirm-title");
const deleteConfirmMessage = document.getElementById("delete-confirm-message");
const deleteCancelBtn = document.getElementById("delete-cancel-btn");
const deleteConfirmBtn = document.getElementById("delete-confirm-btn");
const actionDialogInput = document.getElementById("action-dialog-input");
const statusBar = document.getElementById("status-bar");
const themeBtn = document.getElementById("theme-btn");
const exportBtn = document.getElementById("export-btn");
const clearBtn = document.getElementById("clear-btn");
const addBtn = document.getElementById("add-btn");
const menuBtn = document.getElementById("menu-btn");
const dropdownMenu = document.getElementById("dropdown-menu");
const dropdownItems = document.getElementById("dropdown-items");
const noteSearch = document.getElementById("note-search");
const newFolderBtn = document.getElementById("new-folder-btn");
const noteTitleText = document.getElementById("note-title-text");
const renameBtn = document.getElementById("rename-btn");

const boldBtn = document.getElementById("bold-btn");
const italicBtn = document.getElementById("italic-btn");
const underlineBtn = document.getElementById("underline-btn");
const strikeBtn = document.getElementById("strike-btn");
const pBtn = document.getElementById("p-btn");
const h1Btn = document.getElementById("h1-btn");
const h2Btn = document.getElementById("h2-btn");

let saveTimeout = null;
let notes = [];
const noteSearchTextCache = new WeakMap();
let folders = [];
let activeNoteId = null;
let selectedImage = null;
let draggedNoteId = null;
let draggedNoteIds = [];
let draggedFolderId = null;
let pendingDelete = null;
let dialogAnchor = null;
let dialogReturnFocus = null;
let statusHideTimeout = null;
let editorRevision = 0;
const collapsedFolders = new Set();
const selectedNoteIds = new Set();
let selectionAnchorId = null;

function updateStatus(text) {
  clearTimeout(statusHideTimeout);
  statusBar.textContent = text;
  statusBar.classList.add("visible");
  if (text === "Saved") {
    statusHideTimeout = setTimeout(() => {
      statusBar.classList.remove("visible");
    }, 1500);
  }
}

function showActionDialog(title, message, onConfirm, inputValue = null) {
  deleteConfirmTitle.textContent = title;
  deleteConfirmMessage.textContent = message;
  pendingDelete = onConfirm;
  actionDialogInput.value = inputValue || "";
  actionDialogInput.classList.toggle("hidden", inputValue === null);
  actionDialogInput.setAttribute("aria-label", "Folder name");
  deleteConfirmBtn.classList.toggle("danger", inputValue === null);
  deleteConfirmBtn.textContent = inputValue === null ? "Delete" : "Create";
  dialogReturnFocus = document.activeElement;
  dialogAnchor = dropdownMenu.classList.contains("hidden") ? editorPane : dropdownMenu;
  positionActionDialog();
  document.body.classList.add("delete-confirm-open");
  deleteConfirmation.classList.remove("hidden");
  document.activeElement.blur();
  document.querySelector(".container").inert = true;
  if (inputValue !== null) {
    actionDialogInput.focus();
    actionDialogInput.select();
  } else {
    deleteCancelBtn.focus();
  }
}

function closeDeleteConfirmation() {
  deleteConfirmation.classList.add("hidden");
  document.body.classList.remove("delete-confirm-open");
  deleteConfirmation.removeAttribute("style");
  pendingDelete = null;
  document.querySelector(".container").inert = false;
  const focusTarget = dialogReturnFocus && dialogReturnFocus.isConnected ? dialogReturnFocus : menuBtn;
  dialogAnchor = null;
  dialogReturnFocus = null;
  focusTarget.focus();
}

function positionActionDialog() {
  positionSearchMenu();
  const rect = dialogAnchor.getBoundingClientRect();
  deleteConfirmation.style.left = `${rect.left}px`;
  deleteConfirmation.style.top = `${rect.top}px`;
  deleteConfirmation.style.width = `${rect.width}px`;
  deleteConfirmation.style.height = `${rect.height}px`;
}

function positionSearchMenu() {
  if (!dropdownMenu.classList.contains("hidden")) {
    const top = dropdownMenu.getBoundingClientRect().top;
    dropdownMenu.style.maxHeight = `${Math.max(0, window.innerHeight - top - 8)}px`;
  }
}

window.addEventListener("resize", () => {
  positionSearchMenu();
  if (pendingDelete) {
    positionActionDialog();
  }
});

const dialogResizeObserver = new ResizeObserver(() => {
  if (pendingDelete) {
    positionActionDialog();
  }
});
dialogResizeObserver.observe(editorPane);
dialogResizeObserver.observe(dropdownMenu);

deleteCancelBtn.addEventListener("click", closeDeleteConfirmation);
deleteConfirmation.addEventListener("click", (event) => event.stopPropagation());
deleteConfirmBtn.addEventListener("click", () => {
  const action = pendingDelete;
  const value = actionDialogInput.value.trim();
  const isInputAction = !actionDialogInput.classList.contains("hidden");
  if (isInputAction && (!value || folders.some((folder) => folder.name.toLocaleLowerCase() === value.toLocaleLowerCase()))) {
    deleteConfirmMessage.textContent = value ? "A folder with that name already exists." : "Enter a folder name.";
    actionDialogInput.focus();
    return;
  }
  closeDeleteConfirmation();
  if (action) {
    action(isInputAction ? value : undefined);
    if (document.activeElement === document.body) {
      (dropdownMenu.classList.contains("hidden") ? noteArea : noteSearch).focus();
    }
  }
});

actionDialogInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    deleteConfirmBtn.click();
  }
});

function beginInlineRename(container, currentName, onSave, onCancel) {
  const input = document.createElement("input");
  input.className = "inline-name-input";
  input.type = "text";
  input.value = currentName;
  container.appendChild(input);
  let finished = false;
  const finish = (save) => {
    if (finished) {
      return;
    }
    finished = true;
    const name = input.value.trim();
    input.remove();
    if (save && name) {
      onSave(name);
    } else {
      onCancel();
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

function updateFormatIndicators() {
  boldBtn.classList.toggle("active", document.queryCommandState("bold"));
  italicBtn.classList.toggle("active", document.queryCommandState("italic"));
  underlineBtn.classList.toggle("active", document.queryCommandState("underline"));
  strikeBtn.classList.toggle("active", document.queryCommandState("strikeThrough"));

  let blockValue = document.queryCommandValue("formatBlock") || "";
  blockValue = blockValue.toLowerCase();

  pBtn.classList.toggle("active", blockValue === "p" || blockValue === "div" || blockValue === "");
  h1Btn.classList.toggle("active", blockValue === "h1");
  h2Btn.classList.toggle("active", blockValue === "h2");
}

function format(command, value = null) {
  document.execCommand(command, false, value);
  noteArea.focus();
  updateFormatIndicators();
  triggerSave();
}

boldBtn.addEventListener("click", () => format("bold"));
italicBtn.addEventListener("click", () => format("italic"));
underlineBtn.addEventListener("click", () => format("underline"));
strikeBtn.addEventListener("click", () => format("strikeThrough"));
pBtn.addEventListener("click", () => format("formatBlock", "p"));
h1Btn.addEventListener("click", () => format("formatBlock", "h1"));
h2Btn.addEventListener("click", () => format("formatBlock", "h2"));

noteArea.addEventListener("keyup", updateFormatIndicators);
noteArea.addEventListener("mouseup", updateFormatIndicators);
noteArea.addEventListener("focus", updateFormatIndicators);
document.addEventListener("selectionchange", () => {
  if (document.activeElement === noteArea) {
    updateFormatIndicators();
  }
});

noteArea.addEventListener("keydown", (e) => {
  if (handleParagraphBackspace(e)) return;
  if (handleTodoKey(e)) return;
  if (e.key === "Tab" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    if (!document.execCommand("insertText", false, "\t")) {
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        range.deleteContents();
        const tabNode = document.createTextNode("\t");
        range.insertNode(tabNode);
        range.setStartAfter(tabNode);
        range.setEndAfter(tabNode);
        selection.removeAllRanges();
        selection.addRange(range);
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

function normalizeSearchText(text) {
  return text.replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

function getNoteSearchText(note) {
  if (noteSearchTextCache.has(note)) {
    return noteSearchTextCache.get(note);
  }
  const template = document.createElement("template");
  template.innerHTML = note.content || "";
  template.content.querySelectorAll("img, script, style, input, svg, video, audio, iframe, object").forEach((element) => element.remove());
  template.content.querySelectorAll("br, div, p, h1, h2, h3, h4, h5, h6, li, ul, ol, blockquote, pre, tr, td, th, section, article, hr").forEach((element) => {
    element.before(document.createTextNode(" "));
    element.after(document.createTextNode(" "));
  });
  const text = normalizeSearchText(template.content.textContent || "");
  noteSearchTextCache.set(note, text);
  return text;
}

function renderNoteList() {
  dropdownItems.replaceChildren();
  const query = normalizeSearchText(noteSearch.value);
  const groups = [{ id: "", name: "Notes" }, ...folders];

  groups.forEach((folder) => {
    const isCollapsed = !query && collapsedFolders.has(folder.id);
    const folderNotes = notes.filter((note) => (note.folderId || "") === folder.id);
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
      if (draggedFolderId && draggedFolderId !== folder.id && folder.id) {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "move";
        heading.classList.remove("folder-drop-before", "folder-drop-after");
        const rect = heading.getBoundingClientRect();
        heading.classList.add(event.clientY < rect.top + rect.height / 2 ? "folder-drop-before" : "folder-drop-after");
      } else if (draggedNoteIds.length || draggedNoteId) {
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
      if (draggedFolderId && folder.id && draggedFolderId !== folder.id) {
        const rect = heading.getBoundingClientRect();
        reorderFolder(draggedFolderId, folder.id, event.clientY >= rect.top + rect.height / 2);
      } else if (draggedNoteIds.length || draggedNoteId) {
        moveNotesToFolder(draggedNoteIds.length ? draggedNoteIds : [draggedNoteId], folder.id);
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
        draggedFolderId = folder.id;
        event.stopPropagation();
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", `folder:${folder.id}`);
      });
      toggle.addEventListener("dragend", () => {
        draggedFolderId = null;
        dropdownItems.querySelectorAll(".folder-drop-before, .folder-drop-after").forEach((target) => target.classList.remove("folder-drop-before", "folder-drop-after"));
      });
    }
    const count = document.createElement("span");
    count.className = "folder-count";
    count.textContent = String(folderNotes.length);
    toggle.appendChild(count);
    toggle.addEventListener("click", () => {
      if (collapsedFolders.has(folder.id)) {
        collapsedFolders.delete(folder.id);
      } else {
        collapsedFolders.add(folder.id);
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
        const row = document.createElement("div");
        row.className = "note-row";
        row.dataset.noteId = note.id;
        row.draggable = true;
        row.addEventListener("dragstart", (event) => {
          if (event.target.closest(".note-actions")) {
            event.preventDefault();
            return;
          }
          draggedNoteId = note.id;
          draggedNoteIds = selectedNoteIds.has(note.id) ? [...selectedNoteIds] : [note.id];
          row.classList.add("dragging");
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", note.id);
        });
        row.addEventListener("dragend", () => {
          draggedNoteId = null;
          draggedNoteIds = [];
          row.classList.remove("dragging");
          dropdownItems.querySelectorAll(".drop-target").forEach((target) => target.classList.remove("drop-target"));
          dropdownItems.querySelectorAll(".drop-before, .drop-after").forEach((target) => target.classList.remove("drop-before", "drop-after"));
        });
        const item = document.createElement("button");
        item.className = "dropdown-item note-item";
        if (selectedNoteIds.has(note.id)) {
          item.classList.add("selected-note");
          item.setAttribute("aria-pressed", "true");
        }
        row.addEventListener("dragover", (event) => {
          if (!draggedNoteId || draggedNoteIds.includes(note.id)) {
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
          moveNotesToFolder(draggedNoteIds, note.folderId || "", note.id, after);
        });
        if (note.id === activeNoteId) {
          item.classList.add("current-note");
          item.setAttribute("aria-current", "true");
        }
        item.textContent = note.title || "Untitled Note";
        const actions = document.createElement("div");
        actions.className = "note-actions";
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
            if (note.id === activeNoteId) {
              noteTitleText.textContent = note.title;
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
        deleteNoteBtn.addEventListener("click", () => deleteNote(note));
        actions.append(renameNoteBtn, deleteNoteBtn);
        item.addEventListener("click", (event) => {
          event.stopPropagation();
          const additive = event.metaKey || event.ctrlKey;
          if (event.shiftKey) {
            const visibleIds = [...dropdownItems.querySelectorAll(".note-row")].map((row) => row.dataset.noteId);
            const anchor = visibleIds.includes(selectionAnchorId) ? selectionAnchorId : activeNoteId;
            const start = visibleIds.indexOf(anchor);
            const end = visibleIds.indexOf(note.id);
            if (!additive) selectedNoteIds.clear();
            visibleIds.slice(start < 0 ? end : Math.min(start, end), start < 0 ? end + 1 : Math.max(start, end) + 1)
              .forEach((id) => selectedNoteIds.add(id));
            selectionAnchorId = start < 0 ? note.id : anchor;
          } else if (additive) {
            if (selectedNoteIds.has(note.id)) {
              selectedNoteIds.delete(note.id);
            } else {
              selectedNoteIds.add(note.id);
            }
            selectionAnchorId = note.id;
          } else {
            selectNote(note.id);
            closeNoteMenu();
          }
          dropdownItems.querySelectorAll(".note-row").forEach((row) => {
            const button = row.querySelector(".note-item");
            const selected = selectedNoteIds.has(row.dataset.noteId);
            button.classList.toggle("selected-note", selected);
            button.setAttribute("aria-pressed", String(selected));
          });
        });
        row.append(item, actions);
        group.appendChild(row);
      });
    }
    dropdownItems.appendChild(group);
  });

}

function moveNotesToFolder(noteIds, folderId, targetNoteId = null, after = true) {
  const ids = new Set(noteIds);
  const movingNotes = notes.filter((note) => ids.has(note.id));
  if (movingNotes.length === 0 || ids.has(targetNoteId) || (targetNoteId && !notes.some((note) => note.id === targetNoteId))) {
    return;
  }
  notes = notes.filter((note) => !ids.has(note.id));
  movingNotes.forEach((note) => {
    note.folderId = folderId;
    selectedNoteIds.delete(note.id);
  });
  selectionAnchorId = null;
  const lastFolderIndex = notes.map((note) => note.folderId || "").lastIndexOf(folderId);
  const insertionIndex = targetNoteId ? notes.findIndex((note) => note.id === targetNoteId) + (after ? 1 : 0) : lastFolderIndex + 1;
  notes.splice(insertionIndex, 0, ...movingNotes);
  draggedNoteId = null;
  draggedNoteIds = [];
  renderNoteList();
  triggerSave();
}

function reorderFolder(folderId, targetFolderId, after) {
  const sourceIndex = folders.findIndex((folder) => folder.id === folderId);
  const targetIndex = folders.findIndex((folder) => folder.id === targetFolderId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
    return;
  }
  const [folder] = folders.splice(sourceIndex, 1);
  draggedFolderId = null;
  const adjustedTargetIndex = folders.findIndex((item) => item.id === targetFolderId);
  folders.splice(adjustedTargetIndex + (after ? 1 : 0), 0, folder);
  renderNoteList();
  triggerSave();
}

function createFolder() {
  showActionDialog("New folder", "Enter a name for this folder.", (name) => {
    if (!name) {
      return;
    }
    if (folders.some((folder) => folder.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      updateStatus("A folder with that name already exists");
      return;
    }
    const folder = { id: `folder-${Date.now()}`, name };
    folders.push(folder);
    collapsedFolders.delete(folder.id);
    noteSearch.value = "";
    renderNoteList();
    triggerSave();
  }, "");
}

function renameFolder(folder, heading, controls) {
  controls.forEach((control) => { control.hidden = true; });
  beginInlineRename(heading, folder.name, (name) => {
    if (folders.some((item) => item.id !== folder.id && item.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      updateStatus("A folder with that name already exists");
      renderNoteList();
      return;
    }
    folder.name = name;
    renderNoteList();
    triggerSave();
  }, renderNoteList);
}

function deleteFolder(folder) {
  showActionDialog("Delete folder?", `Delete “${folder.name}”? Its notes will stay in Notes.`, () => {
    notes.forEach((note) => {
      if (note.folderId === folder.id) {
        note.folderId = "";
      }
    });
    folders = folders.filter((item) => item.id !== folder.id);
    collapsedFolders.delete(folder.id);
    renderNoteList();
    triggerSave();
  });
}

function deleteNote(note) {
  showActionDialog("Delete note?", `Delete “${note.title || "Untitled Note"}”?`, () => {
    selectedNoteIds.delete(note.id);
    notes = notes.filter((item) => item.id !== note.id);
    if (notes.length === 0) {
      notes = [{ id: "default", title: "My Note", content: "", folderId: "" }];
    }
    if (note.id === activeNoteId) {
      selectNote(notes[0].id);
    } else {
      renderNoteList();
    }
    triggerSave();
  });
}

function clearNoteSelection() {
  selectedNoteIds.clear();
  selectionAnchorId = null;
  dropdownItems.querySelectorAll(".note-item").forEach((item) => {
    item.classList.remove("selected-note");
    item.setAttribute("aria-pressed", "false");
  });
}

function closeNoteMenu() {
  dropdownMenu.classList.add("hidden");
  clearNoteSelection();
  draggedNoteId = null;
  draggedNoteIds = [];
  draggedFolderId = null;
  dropdownItems.querySelectorAll(".dragging, .drop-target, .drop-before, .drop-after, .folder-drop-before, .folder-drop-after").forEach((item) => {
    item.classList.remove("dragging", "drop-target", "drop-before", "drop-after", "folder-drop-before", "folder-drop-after");
  });
}

noteSearch.addEventListener("input", () => {
  clearNoteSelection();
  renderNoteList();
});
newFolderBtn.addEventListener("click", createFolder);

dropdownMenu.addEventListener("click", (event) => {
  event.stopPropagation();
});

menuBtn.addEventListener("click", (e) => {
  if (pendingDelete) {
    e.stopPropagation();
    return;
  }
  if (dropdownMenu.classList.contains("hidden")) {
    dropdownMenu.classList.remove("hidden");
    positionSearchMenu();
  } else {
    closeNoteMenu();
  }
  e.stopPropagation();
});

document.addEventListener("click", (e) => {
  if (pendingDelete) {
    return;
  }
  if (!dropdownMenu.contains(e.target) && e.target !== menuBtn) {
    closeNoteMenu();
  }
});

document.addEventListener("keydown", (event) => {
  if (pendingDelete && event.key === "Tab") {
    const controls = actionDialogInput.classList.contains("hidden")
      ? [deleteCancelBtn, deleteConfirmBtn]
      : [actionDialogInput, deleteCancelBtn, deleteConfirmBtn];
    const index = controls.indexOf(document.activeElement);
    event.preventDefault();
    controls[(index + (event.shiftKey ? controls.length - 1 : 1)) % controls.length].focus();
    return;
  }
  if (event.key === "Escape" && !deleteConfirmation.classList.contains("hidden")) {
    event.preventDefault();
    closeDeleteConfirmation();
  } else if (event.key === "Escape" && !dropdownMenu.classList.contains("hidden")) {
    event.preventDefault();
    closeNoteMenu();
    menuBtn.focus();
  }
});

function selectNote(id) {
  editorRevision += 1;
  selectedImage = null;
  imageResizeHandle.classList.add("hidden");
  activeNoteId = id;
  const note = notes.find((n) => n.id === id);
  if (note) {
    noteTitleText.textContent = note.title;
    const parser = new DOMParser();
    const doc = parser.parseFromString(note.content || "", "text/html");
    doc.body.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => checkbox.removeAttribute("contenteditable"));
    noteArea.replaceChildren(...doc.body.childNodes);
  } else {
    noteTitleText.textContent = "Untitled Note";
    noteArea.replaceChildren();
  }
  renderNoteList();
  updateFormatIndicators();
}

function addNote() {
  noteSearch.value = "";
  const activeNote = notes.find((note) => note.id === activeNoteId);
  const newNote = {
    id: Date.now().toString(),
    title: "Untitled Note",
    content: "",
    folderId: activeNote ? activeNote.folderId || "" : ""
  };
  notes.push(newNote);
  selectNote(newNote.id);
  triggerSave();
}

addBtn.addEventListener("click", () => {
  addNote();
  closeNoteMenu();
});

renameBtn.addEventListener("click", () => {
  const note = notes.find((n) => n.id === activeNoteId);
  if (note && !document.querySelector(".title-name-input")) {
    noteTitleText.hidden = true;
    renameBtn.hidden = true;
    const input = document.createElement("input");
    input.className = "inline-name-input title-name-input";
    input.value = note.title || "Untitled Note";
    noteTitleText.parentElement.appendChild(input);
    const finish = (save) => {
      if (!input.isConnected) {
        return;
      }
      const name = input.value.trim();
      input.remove();
      noteTitleText.hidden = false;
      renameBtn.hidden = false;
      if (save && name) {
        note.title = name;
        noteTitleText.textContent = name;
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

browser.storage.local.get(["notesList", "foldersList", "theme"]).then((result) => {
  folders = result.foldersList || [];
  if (result.notesList && result.notesList.length > 0) {
    notes = result.notesList;
    activeNoteId = notes[0].id;
  } else {
    notes = [{ id: "default", title: "My Note", content: "" }];
    activeNoteId = "default";
  }
  selectNote(activeNoteId);
  if (result.theme === "dark") {
    document.body.classList.add("dark-theme");
  }
  updateStatus("Saved");
});

themeBtn.addEventListener("click", () => {
  const isDark = document.body.classList.toggle("dark-theme");
  browser.storage.local.set({ theme: isDark ? "dark" : "light" });
});

function triggerSave() {
  const note = notes.find((n) => n.id === activeNoteId);
  if (note) {
    const content = noteArea.innerHTML;
    if (note.content !== content) {
      note.content = content;
      noteSearchTextCache.delete(note);
    }
  }
  
  updateStatus("Saving...");
  
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  
  saveTimeout = setTimeout(() => {
    browser.storage.local.set({ notesList: notes, foldersList: folders }).then(() => {
      updateStatus("Saved");
    }).catch(() => {
      updateStatus("Could not save. Your changes are still open.");
    });
  }, 500);
}

noteArea.addEventListener("input", triggerSave);

function getEditorRangeAtPoint(x, y) {
  if (document.caretRangeFromPoint) {
    return document.caretRangeFromPoint(x, y);
  }
  if (document.caretPositionFromPoint) {
    const position = document.caretPositionFromPoint(x, y);
    if (!position) {
      return null;
    }
    const range = document.createRange();
    range.setStart(position.offsetNode, position.offset);
    range.collapse(true);
    return range;
  }
  return null;
}

function getEditorRange() {
  const selection = window.getSelection();
  if (selection.rangeCount > 0 && noteArea.contains(selection.anchorNode)) {
    return selection.getRangeAt(0).cloneRange();
  }
  const range = document.createRange();
  range.selectNodeContents(noteArea);
  range.collapse(false);
  return range;
}

function insertImageFiles(files, range) {
  const imageFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));
  if (imageFiles.length === 0) {
    return false;
  }

  const targetRange = range || getEditorRange();
  const targetRevision = editorRevision;
  imageFiles.reduce((promise, file) => promise.then(() => new Promise((resolve) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (targetRevision === editorRevision && typeof reader.result === "string" && noteArea.contains(targetRange.commonAncestorContainer)) {
        const image = document.createElement("img");
        image.src = reader.result;
        image.alt = file.name || "Pasted image";
        image.addEventListener("load", positionImageResizeHandle, { once: true });
        targetRange.deleteContents();
        targetRange.insertNode(image);
        targetRange.setStartAfter(image);
        targetRange.collapse(true);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(targetRange);
        noteArea.focus();
        selectImage(image);
        triggerSave();
      }
      resolve();
    });
    reader.addEventListener("error", () => resolve());
    reader.readAsDataURL(file);
  })), Promise.resolve());

  return true;
}

noteArea.addEventListener("paste", (event) => {
  if (event.clipboardData.getData("text/html")) return;
  const files = Array.from(event.clipboardData.items)
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter(Boolean);
  if (files.some((file) => file.type.startsWith("image/"))) {
    event.preventDefault();
    insertImageFiles(files, getEditorRange());
  }
});

noteArea.addEventListener("dragover", (event) => {
  if (Array.from(event.dataTransfer.items).some((item) => item.kind === "file" && item.type.startsWith("image/"))) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }
});

noteArea.addEventListener("drop", (event) => {
  const files = Array.from(event.dataTransfer.files);
  if (files.some((file) => file.type.startsWith("image/"))) {
    event.preventDefault();
    event.stopPropagation();
    const range = getEditorRangeAtPoint(event.clientX, event.clientY);
    insertImageFiles(files, range && noteArea.contains(range.commonAncestorContainer) ? range : getEditorRange());
  }
});

function positionImageResizeHandle() {
  if (!selectedImage || !noteArea.contains(selectedImage)) {
    imageResizeHandle.classList.add("hidden");
    return;
  }
  imageResizeHandle.classList.remove("hidden");
  const imageRect = selectedImage.getBoundingClientRect();
  const paneRect = editorPane.getBoundingClientRect();
  imageResizeHandle.style.left = `${imageRect.right - paneRect.left - imageResizeHandle.offsetWidth / 2}px`;
  imageResizeHandle.style.top = `${imageRect.bottom - paneRect.top - imageResizeHandle.offsetHeight / 2}px`;
}

function selectImage(image) {
  selectedImage = image;
  positionImageResizeHandle();
}

noteArea.addEventListener("click", (event) => {
  if (event.target instanceof HTMLImageElement) {
    selectImage(event.target);
  } else {
    selectedImage = null;
    imageResizeHandle.classList.add("hidden");
  }
});

noteArea.addEventListener("scroll", positionImageResizeHandle);
window.addEventListener("resize", positionImageResizeHandle);

imageResizeHandle.addEventListener("pointerdown", (event) => {
  if (!selectedImage) {
    return;
  }
  event.preventDefault();
  const startX = event.clientX;
  const startWidth = selectedImage.getBoundingClientRect().width;
  const image = selectedImage;
  imageResizeHandle.setPointerCapture(event.pointerId);

  const resize = (pointerEvent) => {
    const maxWidth = Math.max(1, noteArea.clientWidth - 16);
    const width = Math.min(maxWidth, Math.max(48, startWidth + pointerEvent.clientX - startX));
    image.style.width = `${width}px`;
    positionImageResizeHandle();
  };

  const finishResize = () => {
    imageResizeHandle.removeEventListener("pointermove", resize);
    imageResizeHandle.removeEventListener("pointerup", finishResize);
    imageResizeHandle.removeEventListener("pointercancel", finishResize);
    triggerSave();
  };

  imageResizeHandle.addEventListener("pointermove", resize);
  imageResizeHandle.addEventListener("pointerup", finishResize);
  imageResizeHandle.addEventListener("pointercancel", finishResize);
});

exportBtn.addEventListener("click", () => {
  const note = notes.find((n) => n.id === activeNoteId);
  const title = (note ? note.title : "notes").replace(/[^a-z0-9]/gi, "_").toLowerCase();
  const notesHtml = noteArea.innerHTML;
  const blob = new Blob([notesHtml], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title}.html`;
  a.click();
  
  URL.revokeObjectURL(url);
});

clearBtn.addEventListener("click", () => {
  const note = notes.find((item) => item.id === activeNoteId);
  if (note) {
    deleteNote(note);
  }
});

function todoAtSelection() {
  const node = window.getSelection().anchorNode;
  const element = node && (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement);
  const item = element && element.closest("[data-todo]");
  return item && noteArea.contains(item) ? item : null;
}

function todoMarkup(text = "", depth = 0, checked = false) {
  const item = document.createElement("div");
  item.dataset.todo = "true";
  item.dataset.depth = String(depth);
  item.style.marginLeft = `${depth * 24}px`;
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.setAttribute("aria-label", "Complete task");
  if (checked) checkbox.setAttribute("checked", "");
  item.append(checkbox, text ? document.createTextNode(text) : document.createElement("br"));
  return item.outerHTML;
}

const todoBtn = document.getElementById("todo-btn");
todoBtn.addEventListener("mousedown", (event) => event.preventDefault());
noteArea.addEventListener("mousedown", (event) => {
  if (event.target.matches('input[type="checkbox"]')) event.preventDefault();
});
todoBtn.addEventListener("click", () => {
  noteArea.focus();
  const template = document.createElement("template");
  template.innerHTML = todoMarkup();
  const row = template.content.firstElementChild;
  const range = getEditorRange();
  const node = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement;
  const block = node.closest("div, p, h1, h2, li");
  if (range.collapsed && block && block !== noteArea && noteArea.contains(block) && !block.querySelector("div, p, li, [data-todo]")) {
    const content = block.cloneNode(true);
    content.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => checkbox.remove());
    row.lastChild.remove();
    row.append(...content.childNodes);
    if (row.childNodes.length === 1) row.append(document.createElement("br"));
    range.selectNode(block);
  }
  insertTodoEdit(range, [row], 0, 1);
});

noteArea.addEventListener("change", (event) => {
  if (event.target.matches('input[type="checkbox"]')) {
    event.target.toggleAttribute("checked", event.target.checked);
    triggerSave();
  }
});

function insertTodoEdit(range, rows, caretRow, caretOffset) {
  const marker = document.createElement("span");
  marker.dataset.todoCaret = "true";
  rows[caretRow].insertBefore(marker, rows[caretRow].childNodes[caretOffset] || null);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  const replaced = range.startContainer === range.endContainer && range.endOffset > range.startOffset
    ? range.startContainer.childNodes[range.startOffset] : null;
  const lastReplaced = replaced ? range.endContainer.childNodes[range.endOffset - 1] : null;
  if (replaced?.nodeType === Node.ELEMENT_NODE) {
    const start = document.createTextNode("\u200b");
    const end = document.createTextNode("\u200b");
    replaced.before(start);
    lastReplaced.after(end);
    range.setStartBefore(start);
    range.setEndAfter(end);
  }
  selection.removeAllRanges();
  selection.addRange(range);
  document.execCommand("insertHTML", false, rows.map((row) => row.outerHTML).join(""));

  const insertedMarker = noteArea.querySelector("[data-todo-caret]");
  if (insertedMarker) {
    range = document.createRange();
    range.setStartBefore(insertedMarker);
    range.collapse(true);
    insertedMarker.remove();
    selection.removeAllRanges();
    selection.addRange(range);
  }
  triggerSave();
}

function handleParagraphBackspace(event) {
  if (event.key !== "Backspace" || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return false;
  const selection = window.getSelection();
  if (!selection.rangeCount || !selection.isCollapsed) return false;
  const range = selection.getRangeAt(0);
  const node = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement;
  const paragraph = node.closest("div, p, h1, h2");
  if (!paragraph || paragraph === noteArea || !noteArea.contains(paragraph) || paragraph.closest("[data-todo]")) return false;
  let previous = paragraph.previousSibling;
  while (previous?.nodeType === Node.TEXT_NODE && !previous.textContent.replace(/\u200b/g, "").trim()) previous = previous.previousSibling;
  if (!previous?.matches?.("[data-todo]")) return false;
  const leading = document.createRange();
  leading.selectNodeContents(paragraph);
  leading.setEnd(range.startContainer, range.startOffset);
  const fragment = leading.cloneContents();
  if (fragment.textContent.length || fragment.querySelector("img, input, br, video, audio")) return false;
  event.preventDefault();
  const merged = previous.cloneNode(true);
  if (merged.lastChild?.nodeName === "BR") merged.lastChild.remove();
  const caretOffset = merged.childNodes.length;
  const content = paragraph.cloneNode(true);
  if (content.childNodes.length === 1 && content.firstChild.nodeName === "BR") content.firstChild.remove();
  merged.append(...content.childNodes);
  if (merged.childNodes.length === 1) merged.append(document.createElement("br"));
  const replacement = document.createRange();
  replacement.setStartBefore(previous);
  replacement.setEndAfter(paragraph);
  insertTodoEdit(replacement, [merged], 0, caretOffset);
  return true;
}

function handleTodoKey(event) {
  const item = todoAtSelection();
  if (!item || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return false;
  const selection = window.getSelection();
  if (!selection.rangeCount) return false;
  const range = selection.getRangeAt(0);
  if (!item.contains(range.startContainer) || !item.contains(range.endContainer)) return false;
  const before = document.createRange();
  before.selectNodeContents(item);
  before.setEnd(range.startContainer, range.startOffset);
  const leading = before.cloneContents();
  leading.querySelectorAll("input, br").forEach((node) => node.remove());
  if (event.key === "Backspace" && range.collapsed && !leading.textContent.length && !leading.querySelector("img")) {
    event.preventDefault();
    const plain = document.createElement("div");
    const content = item.cloneNode(true);
    content.querySelectorAll('input[type="checkbox"]').forEach((node) => node.remove());
    plain.append(...content.childNodes);
    if (!plain.hasChildNodes()) plain.append(document.createElement("br"));
    const replacement = document.createRange();
    replacement.selectNode(item);
    insertTodoEdit(replacement, [plain], 0, 0);
    return true;
  }
  if (event.key === "Tab") {
    event.preventDefault();
    const clone = item.cloneNode(true);
    const depth = Math.max(0, Math.min(12, (Number(item.dataset.depth) || 0) + (event.shiftKey ? -1 : 1)));
    clone.dataset.depth = String(depth);
    clone.style.marginLeft = `${depth * 24}px`;
    const replacement = document.createRange();
    replacement.selectNode(item);
    insertTodoEdit(replacement, [clone], 0, clone.childNodes.length - (clone.lastChild?.nodeName === "BR" ? 1 : 0));
    return true;
  }
  if (event.key !== "Enter" || event.shiftKey) return false;
  event.preventDefault();
  if (!item.textContent.length && !item.querySelector("img, video, audio")) {
    const plain = document.createElement("div");
    plain.append(document.createElement("br"));
    const replacement = document.createRange();
    replacement.selectNode(item);
    insertTodoEdit(replacement, [plain], 0, 0);
    return true;
  }
  const after = document.createRange();
  after.selectNodeContents(item);
  after.setStart(range.endContainer, range.endOffset);
  const trailing = after.cloneContents();
  const first = item.cloneNode(false);
  const checkbox = item.querySelector('input[type="checkbox"]');
  first.append(checkbox ? checkbox.cloneNode(true) : document.createElement("br"));
  const head = before.cloneContents();
  head.querySelectorAll('input[type="checkbox"]').forEach((node) => node.remove());
  trailing.querySelectorAll('input[type="checkbox"]').forEach((node) => node.remove());
  if (head.lastChild?.nodeName === "BR") head.lastChild.remove();
  first.append(head);
  if (first.childNodes.length === 1) first.append(document.createElement("br"));
  const template = document.createElement("template");
  template.innerHTML = todoMarkup("", Number(item.dataset.depth) || 0);
  const next = template.content.firstElementChild;
  if (trailing.hasChildNodes()) {
    next.lastChild.remove();
    next.append(trailing);
  }
  const replacement = document.createRange();
  replacement.selectNode(item);
  insertTodoEdit(replacement, [first, next], 1, 1);
  return true;
}

for (const action of ["copy", "cut"]) {
  noteArea.addEventListener(action, (event) => {
    const selection = window.getSelection();
    if (!selection.rangeCount || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    const container = document.createElement("div");
    container.append(range.cloneContents());
    if (!container.querySelector("[data-todo], input[type=checkbox]")) return;
    event.preventDefault();
    event.clipboardData.setData("text/html", container.innerHTML);
    container.querySelectorAll('input[type="checkbox"]').forEach((box) => box.replaceWith(document.createTextNode(box.hasAttribute("checked") ? "[x] " : "[ ] ")));
    container.querySelectorAll("div").forEach((line) => line.append(document.createTextNode("\n")));
    event.clipboardData.setData("text/plain", container.textContent);
    if (action === "cut") {
      document.execCommand("delete");
      triggerSave();
    }
  });
}

noteArea.addEventListener("paste", (event) => {
  if (event.defaultPrevented) return;
  const html = event.clipboardData.getData("text/html");
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!doc.querySelector("[data-todo], input[type=checkbox]")) return;
  event.preventDefault();
  const allowed = new Set(["DIV", "P", "BR", "SPAN", "B", "STRONG", "I", "EM", "U", "S", "UL", "OL", "LI", "H1", "H2", "INPUT", "A", "IMG", "BLOCKQUOTE", "PRE", "CODE", "TABLE", "TBODY", "TR", "TD", "TH"]);
  doc.body.querySelectorAll("script, style, iframe, object").forEach((node) => node.remove());
  for (const node of Array.from(doc.body.querySelectorAll("*"))) {
    if (!allowed.has(node.tagName)) {
      node.replaceWith(...node.childNodes);
      continue;
    }
    const todo = node.hasAttribute("data-todo");
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
    if (todo) {
      node.dataset.todo = "true";
      node.dataset.depth = String(depth);
      node.style.marginLeft = `${depth * 24}px`;
    }
  }
  document.execCommand("insertHTML", false, doc.body.innerHTML);
  triggerSave();
});
