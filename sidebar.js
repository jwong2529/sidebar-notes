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
let folders = [];
let activeNoteId = null;
let selectedImage = null;
let draggedNoteId = null;
let draggedFolderId = null;
let pendingDelete = null;
let dialogAnchor = null;
let dialogReturnFocus = null;
let statusHideTimeout = null;
let editorRevision = 0;
const collapsedFolders = new Set();

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

function renderNoteList() {
  dropdownItems.replaceChildren();
  const query = noteSearch.value.trim().toLocaleLowerCase();
  const groups = [{ id: "", name: "Notes" }, ...folders];

  groups.forEach((folder) => {
    const isCollapsed = !query && collapsedFolders.has(folder.id);
    const folderNotes = notes.filter((note) => (note.folderId || "") === folder.id);
    const matchingNotes = folderNotes.filter((note) =>
      !query || (note.title || "Untitled Note").toLocaleLowerCase().includes(query) || folder.name.toLocaleLowerCase().includes(query)
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
      } else if (draggedNoteId) {
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
      } else if (draggedNoteId) {
        moveNoteToFolder(draggedNoteId, folder.id);
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
        row.draggable = true;
        row.addEventListener("dragstart", (event) => {
          if (event.target.closest(".note-actions")) {
            event.preventDefault();
            return;
          }
          draggedNoteId = note.id;
          row.classList.add("dragging");
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", note.id);
        });
        row.addEventListener("dragend", () => {
          draggedNoteId = null;
          row.classList.remove("dragging");
          dropdownItems.querySelectorAll(".drop-target").forEach((target) => target.classList.remove("drop-target"));
          dropdownItems.querySelectorAll(".drop-before, .drop-after").forEach((target) => target.classList.remove("drop-before", "drop-after"));
        });
        const item = document.createElement("button");
        item.className = "dropdown-item note-item";
        row.addEventListener("dragover", (event) => {
          if (!draggedNoteId || draggedNoteId === note.id) {
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
          moveNoteToFolder(draggedNoteId, note.folderId || "", note.id, after);
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
        item.addEventListener("click", () => {
          selectNote(note.id);
          dropdownMenu.classList.add("hidden");
        });
        row.append(item, actions);
        group.appendChild(row);
      });
    }
    dropdownItems.appendChild(group);
  });

}

function moveNoteToFolder(noteId, folderId, targetNoteId = null, after = true) {
  const note = notes.find((item) => item.id === noteId);
  if (!note || noteId === targetNoteId) {
    return;
  }
  if (targetNoteId && !notes.some((item) => item.id === targetNoteId)) {
    return;
  }
  draggedNoteId = null;
  notes = notes.filter((item) => item.id !== noteId);
  note.folderId = folderId;
  if (targetNoteId) {
    const targetIndex = notes.findIndex((item) => item.id === targetNoteId);
    notes.splice(targetIndex + (after ? 1 : 0), 0, note);
  } else {
    const lastFolderIndex = notes.map((item) => item.folderId || "").lastIndexOf(folderId);
    notes.splice(lastFolderIndex + 1, 0, note);
  }
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

noteSearch.addEventListener("input", renderNoteList);
newFolderBtn.addEventListener("click", createFolder);

dropdownMenu.addEventListener("click", (event) => {
  event.stopPropagation();
});

menuBtn.addEventListener("click", (e) => {
  if (pendingDelete) {
    e.stopPropagation();
    return;
  }
  dropdownMenu.classList.toggle("hidden");
  positionSearchMenu();
  e.stopPropagation();
});

document.addEventListener("click", (e) => {
  if (pendingDelete) {
    return;
  }
  if (!dropdownMenu.contains(e.target) && e.target !== menuBtn) {
    dropdownMenu.classList.add("hidden");
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
    dropdownMenu.classList.add("hidden");
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
  dropdownMenu.classList.add("hidden");
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
    note.content = noteArea.innerHTML;
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
