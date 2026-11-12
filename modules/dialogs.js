import { dom } from "./dom.js";
import { state } from "./state.js";

export function positionSearchMenu() {
  if (!dom.dropdownMenu.classList.contains("hidden")) {
    const top = dom.dropdownMenu.getBoundingClientRect().top;
    dom.dropdownMenu.style.maxHeight = `${Math.max(0, window.innerHeight - top - 8)}px`;
  }
}

export function positionActionDialog() {
  positionSearchMenu();
  if (!state.dialogAnchor) return;
  const rect = state.dialogAnchor.getBoundingClientRect();
  dom.deleteConfirmation.style.left = `${rect.left}px`;
  dom.deleteConfirmation.style.top = `${rect.top}px`;
  dom.deleteConfirmation.style.width = `${rect.width}px`;
  dom.deleteConfirmation.style.height = `${rect.height}px`;
}

export function showActionDialog(title, message, onConfirm, inputValue = null) {
  dom.deleteConfirmTitle.textContent = title;
  dom.deleteConfirmMessage.textContent = message;
  state.pendingDelete = onConfirm;
  dom.actionDialogInput.value = inputValue || "";
  dom.actionDialogInput.classList.toggle("hidden", inputValue === null);
  dom.actionDialogInput.setAttribute("aria-label", "Folder name");
  dom.deleteConfirmBtn.classList.toggle("danger", inputValue === null);
  dom.deleteConfirmBtn.textContent = inputValue === null ? "Delete" : "Create";
  state.dialogReturnFocus = document.activeElement;
  state.dialogAnchor = dom.dropdownMenu.classList.contains("hidden") ? dom.editorPane : dom.dropdownMenu;
  positionActionDialog();
  document.body.classList.add("delete-confirm-open");
  dom.deleteConfirmation.classList.remove("hidden");
  document.activeElement.blur();
  document.querySelector(".container").inert = true;
  if (inputValue !== null) {
    dom.actionDialogInput.focus();
    dom.actionDialogInput.select();
  } else {
    dom.deleteCancelBtn.focus();
  }
}

export function closeDeleteConfirmation() {
  dom.deleteConfirmation.classList.add("hidden");
  document.body.classList.remove("delete-confirm-open");
  dom.deleteConfirmation.removeAttribute("style");
  state.pendingDelete = null;
  document.querySelector(".container").inert = false;
  const focusTarget = state.dialogReturnFocus && state.dialogReturnFocus.isConnected ? state.dialogReturnFocus : dom.menuBtn;
  state.dialogAnchor = null;
  state.dialogReturnFocus = null;
  focusTarget.focus();
}

export function beginInlineRename(container, currentName, onSave, onCancel) {
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

export function initDialogs() {
  const dialogResizeObserver = new ResizeObserver(() => {
    if (state.pendingDelete) {
      positionActionDialog();
    }
  });
  dialogResizeObserver.observe(dom.editorPane);
  dialogResizeObserver.observe(dom.dropdownMenu);

  dom.deleteCancelBtn.addEventListener("click", closeDeleteConfirmation);
  dom.deleteConfirmation.addEventListener("click", (event) => event.stopPropagation());
  dom.deleteConfirmBtn.addEventListener("click", () => {
    const action = state.pendingDelete;
    const value = dom.actionDialogInput.value.trim();
    const isInputAction = !dom.actionDialogInput.classList.contains("hidden");
    if (isInputAction && (!value || state.folders.some((folder) => folder.name.toLocaleLowerCase() === value.toLocaleLowerCase()))) {
      dom.deleteConfirmMessage.textContent = value ? "A folder with that name already exists." : "Enter a folder name.";
      dom.actionDialogInput.focus();
      return;
    }
    closeDeleteConfirmation();
    if (action) {
      action(isInputAction ? value : undefined);
      if (document.activeElement === document.body) {
        (dom.dropdownMenu.classList.contains("hidden") ? dom.noteArea : dom.noteSearch).focus();
      }
    }
  });

  dom.actionDialogInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      dom.deleteConfirmBtn.click();
    }
  });
}