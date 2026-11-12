const noteArea = document.getElementById("note-area");
const editorPane = document.querySelector(".editor-pane");
const imageResizeHandle = document.getElementById("image-resize-handle");
const statusBar = document.getElementById("status-bar");
const themeBtn = document.getElementById("theme-btn");
const exportBtn = document.getElementById("export-btn");
const clearBtn = document.getElementById("clear-btn");
const addBtn = document.getElementById("add-btn");
const menuBtn = document.getElementById("menu-btn");
const dropdownMenu = document.getElementById("dropdown-menu");
const dropdownItems = document.getElementById("dropdown-items");
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
let activeNoteId = null;
let selectedImage = null;

function updateStatus(text) {
  statusBar.textContent = text;
  statusBar.classList.add("visible");
  if (text === "Saved") {
    setTimeout(() => {
      statusBar.classList.remove("visible");
    }, 1500);
  }
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
  notes.forEach((note) => {
    const item = document.createElement("button");
    item.className = "dropdown-item";
    if (note.id === activeNoteId) {
      item.classList.add("active");
    }
    item.textContent = note.title || "Untitled Note";
    item.addEventListener("click", () => {
      selectNote(note.id);
      dropdownMenu.classList.add("hidden");
    });
    dropdownItems.appendChild(item);
  });
}

menuBtn.addEventListener("click", (e) => {
  dropdownMenu.classList.toggle("hidden");
  e.stopPropagation();
});

document.addEventListener("click", (e) => {
  if (!dropdownMenu.contains(e.target) && e.target !== menuBtn) {
    dropdownMenu.classList.add("hidden");
  }
});

function selectNote(id) {
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
  const newNote = {
    id: Date.now().toString(),
    title: "Untitled Note",
    content: ""
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
  if (note) {
    const newName = prompt("Enter new name for this note:", note.title);
    if (newName !== null && newName.trim() !== "") {
      note.title = newName.trim();
      renderNoteList();
      selectNote(note.id);
      triggerSave();
    }
  }
});

browser.storage.local.get(["notesList", "theme"]).then((result) => {
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
    browser.storage.local.set({ notesList: notes }).then(() => {
      updateStatus("Saved");
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
  imageFiles.reduce((promise, file) => promise.then(() => new Promise((resolve) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string" && noteArea.contains(targetRange.commonAncestorContainer)) {
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
  if (confirm("Are you sure you want to delete this note?")) {
    notes = notes.filter((n) => n.id !== activeNoteId);
    if (notes.length === 0) {
      notes = [{ id: "default", title: "My Note", content: "" }];
    }
    selectNote(notes[0].id);
    triggerSave();
  }
});
