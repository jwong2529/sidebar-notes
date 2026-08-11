const noteArea = document.getElementById("note-area");
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
const pBtn = document.getElementById("p-btn");
const h1Btn = document.getElementById("h1-btn");
const h2Btn = document.getElementById("h2-btn");

let saveTimeout = null;
let notes = [];
let activeNoteId = null;

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
