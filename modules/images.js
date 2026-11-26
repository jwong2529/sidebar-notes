import { dom } from "./dom.js";
import { state } from "./state.js";
import { triggerSave, updateStatus } from "./storage.js";
import { getEditorRange, getEditorRangeAtPoint } from "./range.js";
import { editBlocks, recordEditorState } from "./editor-history.js";

let contextMenuImage = null;

function getImageExtension(src) {
  const mimeMatch = /^data:image\/([a-z0-9+.-]+)[;,]/i.exec(src);
  if (mimeMatch) {
    const subtype = mimeMatch[1].toLowerCase();
    if (subtype === "jpeg") return "jpg";
    if (subtype === "svg+xml") return "svg";
    if (subtype === "x-icon" || subtype === "vnd.microsoft.icon") return "ico";
    return subtype;
  }
  try {
    const pathname = new URL(src).pathname;
    const extMatch = /\.([a-z0-9]+)$/i.exec(pathname);
    if (extMatch) {
      const ext = extMatch[1].toLowerCase();
      return ext === "jpeg" ? "jpg" : ext;
    }
  } catch {}
  return "png";
}

export function getImageDownloadFilename(image) {
  const ext = getImageExtension(image.src || "");
  const rawName = (image.alt || "")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^-+|-+$/g, "");
  const baseName = rawName || "pasted-image";
  if (/\.(png|jpe?g|gif|webp|avif|bmp|svg|ico)$/i.test(baseName)) {
    return baseName;
  }
  return `${baseName}.${ext}`;
}

function triggerAnchorDownload(href, filename) {
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
}

export async function downloadImage(image) {
  const src = image?.src;
  if (!src) {
    return;
  }
  const filename = getImageDownloadFilename(image);
  try {
    const response = await fetch(src);
    if (!response.ok) {
      throw new Error("Image fetch failed");
    }
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    triggerAnchorDownload(objectUrl, filename);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  } catch {
    triggerAnchorDownload(src, filename);
  }
}

async function imageToPngBlob(image) {
  const src = image?.src;
  if (!src) {
    return null;
  }
  try {
    const response = await fetch(src);
    if (response.ok) {
      const blob = await response.blob();
      if (blob.type === "image/png") {
        return blob;
      }
    }
  } catch {}
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) {
    return null;
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }
  ctx.drawImage(image, 0, 0, width, height);
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

export async function copyImage(image) {
  if (!image?.src || !navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    updateStatus("Could not copy image");
    return false;
  }
  try {
    const pngBlob = await imageToPngBlob(image);
    if (!pngBlob) {
      updateStatus("Could not copy image");
      return false;
    }
    await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob })]);
    updateStatus("Image copied");
    return true;
  } catch {
    updateStatus("Could not copy image");
    return false;
  }
}

export function closeImageContextMenu() {
  contextMenuImage = null;
  if (dom.imageContextMenu) {
    dom.imageContextMenu.classList.add("hidden");
  }
}

function openImageContextMenu(image, clientX, clientY) {
  if (!dom.imageContextMenu || !dom.editorPane) {
    return;
  }
  contextMenuImage = image;
  dom.imageContextMenu.classList.remove("hidden");
  const paneRect = dom.editorPane.getBoundingClientRect();
  const menuRect = dom.imageContextMenu.getBoundingClientRect();
  const maxLeft = Math.max(4, paneRect.width - menuRect.width - 4);
  const maxTop = Math.max(4, paneRect.height - menuRect.height - 4);
  const left = Math.min(maxLeft, Math.max(4, clientX - paneRect.left));
  const top = Math.min(maxTop, Math.max(4, clientY - paneRect.top));
  dom.imageContextMenu.style.left = `${left}px`;
  dom.imageContextMenu.style.top = `${top}px`;
}

export function positionImageResizeHandle() {
  if (!state.selectedImage || !dom.noteArea.contains(state.selectedImage)) {
    state.selectedImage = null;
    dom.imageResizeHandle.classList.add("hidden");
    closeImageContextMenu();
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
    closeImageContextMenu();
    if (event.target instanceof HTMLImageElement) {
      selectImage(event.target);
    } else {
      state.selectedImage = null;
      dom.imageResizeHandle.classList.add("hidden");
    }
  });

  dom.noteArea.addEventListener("contextmenu", (event) => {
    if (event.target instanceof HTMLImageElement) {
      event.preventDefault();
      selectImage(event.target);
      openImageContextMenu(event.target, event.clientX, event.clientY);
    } else {
      closeImageContextMenu();
    }
  });

  if (dom.downloadImageBtn) {
    dom.downloadImageBtn.addEventListener("click", () => {
      const targetImage = contextMenuImage;
      closeImageContextMenu();
      if (targetImage) {
        downloadImage(targetImage);
      }
    });
  }

  if (dom.copyImageBtn) {
    dom.copyImageBtn.addEventListener("click", () => {
      const targetImage = contextMenuImage;
      closeImageContextMenu();
      if (targetImage) {
        copyImage(targetImage);
      }
    });
  }

  document.addEventListener("click", (event) => {
    if (dom.imageContextMenu && !dom.imageContextMenu.contains(event.target)) {
      closeImageContextMenu();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && dom.imageContextMenu && !dom.imageContextMenu.classList.contains("hidden")) {
      event.preventDefault();
      closeImageContextMenu();
    }
  });

  dom.noteArea.addEventListener("input", positionImageResizeHandle);
  dom.noteArea.addEventListener("keyup", positionImageResizeHandle);
  dom.noteArea.addEventListener("scroll", () => {
    positionImageResizeHandle();
    closeImageContextMenu();
  });
  window.addEventListener("resize", () => {
    positionImageResizeHandle();
    closeImageContextMenu();
  });
  window.addEventListener("blur", closeImageContextMenu);

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