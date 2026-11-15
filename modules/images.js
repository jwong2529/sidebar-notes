import { dom } from "./dom.js";
import { state } from "./state.js";
import { triggerSave } from "./storage.js";
import { getEditorRange, getEditorRangeAtPoint } from "./range.js";
import { editBlocks, recordEditorState } from "./editor-history.js";

export function positionImageResizeHandle() {
  if (!state.selectedImage || !dom.noteArea.contains(state.selectedImage)) {
    dom.imageResizeHandle.classList.add("hidden");
    return;
  }
  dom.imageResizeHandle.classList.remove("hidden");
  const imageRect = state.selectedImage.getBoundingClientRect();
  const paneRect = dom.editorPane.getBoundingClientRect();
  dom.imageResizeHandle.style.left = `${imageRect.right - paneRect.left - dom.imageResizeHandle.offsetWidth / 2}px`;
  dom.imageResizeHandle.style.top = `${imageRect.bottom - paneRect.top - dom.imageResizeHandle.offsetHeight / 2}px`;
}

export function selectImage(image) {
  state.selectedImage = image;
  positionImageResizeHandle();
}

export function insertImageFiles(files, range) {
  const imageFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));
  if (imageFiles.length === 0) {
    return false;
  }

  const targetRange = range || getEditorRange();
  const targetRevision = state.editorRevision;
  imageFiles.reduce((promise, file) => promise.then(() => new Promise((resolve) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (targetRevision === state.editorRevision && typeof reader.result === "string" && dom.noteArea.contains(targetRange.commonAncestorContainer)) {
        let image;
        editBlocks(() => {
          image = document.createElement("img");
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
          dom.noteArea.focus();
        });
        selectImage(image);
      }
      resolve();
    });
    reader.addEventListener("error", () => resolve());
    reader.readAsDataURL(file);
  })), Promise.resolve());

  return true;
}

export function initImages() {
  dom.noteArea.addEventListener("paste", (event) => {
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

  dom.noteArea.addEventListener("dragover", (event) => {
    if (Array.from(event.dataTransfer.items).some((item) => item.kind === "file" && item.type.startsWith("image/"))) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    }
  });

  dom.noteArea.addEventListener("drop", (event) => {
    const files = Array.from(event.dataTransfer.files);
    if (files.some((file) => file.type.startsWith("image/"))) {
      event.preventDefault();
      event.stopPropagation();
      const range = getEditorRangeAtPoint(event.clientX, event.clientY);
      insertImageFiles(files, range && dom.noteArea.contains(range.commonAncestorContainer) ? range : getEditorRange());
    }
  });

  dom.noteArea.addEventListener("click", (event) => {
    if (event.target instanceof HTMLImageElement) {
      selectImage(event.target);
    } else {
      state.selectedImage = null;
      dom.imageResizeHandle.classList.add("hidden");
    }
  });

  dom.noteArea.addEventListener("scroll", positionImageResizeHandle);
  window.addEventListener("resize", positionImageResizeHandle);

  dom.imageResizeHandle.addEventListener("pointerdown", (event) => {
    if (!state.selectedImage) {
      return;
    }
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = state.selectedImage.getBoundingClientRect().width;
    const image = state.selectedImage;
    recordEditorState();
    dom.imageResizeHandle.setPointerCapture(event.pointerId);

    const resize = (pointerEvent) => {
      const maxWidth = Math.max(1, dom.noteArea.clientWidth - 16);
      const width = Math.min(maxWidth, Math.max(48, startWidth + pointerEvent.clientX - startX));
      image.style.width = `${width}px`;
      positionImageResizeHandle();
    };

    const finishResize = () => {
      dom.imageResizeHandle.removeEventListener("pointermove", resize);
      dom.imageResizeHandle.removeEventListener("pointerup", finishResize);
      dom.imageResizeHandle.removeEventListener("pointercancel", finishResize);
      recordEditorState();
    };

    dom.imageResizeHandle.addEventListener("pointermove", resize);
    dom.imageResizeHandle.addEventListener("pointerup", finishResize);
    dom.imageResizeHandle.addEventListener("pointercancel", finishResize);
  });
}