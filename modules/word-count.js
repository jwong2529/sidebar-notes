import { dom } from "./dom.js";
import { state } from "./state.js";

const SKIP_TAGS = new Set([
  "IMG",
  "SVG",
  "VIDEO",
  "AUDIO",
  "IFRAME",
  "OBJECT",
  "SCRIPT",
  "STYLE",
  "INPUT",
  "TEXTAREA",
  "SELECT",
  "BUTTON"
]);

const BOUNDARY_ONLY_TAGS = new Set([
  "BR",
  "HR",
  "IMG",
  "SVG",
  "VIDEO",
  "AUDIO",
  "IFRAME",
  "OBJECT"
]);

const BLOCK_TAGS = new Set([
  "DIV",
  "P",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "LI",
  "UL",
  "OL",
  "BLOCKQUOTE",
  "PRE",
  "TR",
  "TD",
  "TH",
  "SECTION",
  "ARTICLE",
  "HEADER",
  "FOOTER",
  "ASIDE",
  "MAIN",
  "NAV"
]);

const ZERO_WIDTH_RE = /[\u200B\u200C\uFEFF]/g;
const NEWLINE_RE = /[\r\n]+/g;

const wordSegmenter = typeof Intl !== "undefined" && typeof Intl.Segmenter === "function"
  ? new Intl.Segmenter(undefined, { granularity: "word" })
  : null;

const graphemeSegmenter = typeof Intl !== "undefined" && typeof Intl.Segmenter === "function"
  ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
  : null;

function shouldSkipElement(element) {
  if (SKIP_TAGS.has(element.tagName)) {
    return true;
  }
  if (element.hasAttribute?.("data-bullet-marker") || element.hasAttribute?.("data-number-marker")) {
    return true;
  }
  if (element.getAttribute?.("aria-hidden") === "true") {
    return true;
  }
  return false;
}

function collectTextChunks(node, chunks, current) {
  if (!node) {
    return;
  }
  if (node.nodeType === 3) {
    const cleaned = (node.nodeValue || "").replace(ZERO_WIDTH_RE, "");
    if (!cleaned) {
      return;
    }
    const parts = cleaned.split(NEWLINE_RE);
    for (let i = 0; i < parts.length; i++) {
      if (i > 0 && current.value) {
        chunks.push(current.value);
        current.value = "";
      }
      if (parts[i]) {
        current.value += parts[i];
      }
    }
    return;
  }
  if (node.nodeType !== 1) {
    return;
  }
  const tag = node.tagName;
  if (BOUNDARY_ONLY_TAGS.has(tag)) {
    if (current.value) {
      chunks.push(current.value);
      current.value = "";
    }
    return;
  }
  if (shouldSkipElement(node)) {
    return;
  }
  const isBlock = BLOCK_TAGS.has(tag);
  if (isBlock && current.value) {
    chunks.push(current.value);
    current.value = "";
  }
  const children = node.childNodes;
  if (children) {
    for (let i = 0; i < children.length; i++) {
      collectTextChunks(children[i], chunks, current);
    }
  }
  if (isBlock && current.value) {
    chunks.push(current.value);
    current.value = "";
  }
}

function countGraphemes(text) {
  if (!text) {
    return 0;
  }
  if (!graphemeSegmenter) {
    return Array.from(text).length;
  }
  let count = 0;
  for (const _ of graphemeSegmenter.segment(text)) {
    count += 1;
  }
  return count;
}

function countWordsInText(text) {
  if (!text) {
    return 0;
  }
  if (!wordSegmenter) {
    const trimmed = text.trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
  }
  let count = 0;
  for (const segment of wordSegmenter.segment(text)) {
    if (segment.isWordLike) {
      count += 1;
    }
  }
  return count;
}

export function countWordsAndCharacters(root) {
  if (!root) {
    return { words: 0, characters: 0 };
  }
  const chunks = [];
  const current = { value: "" };
  const children = root.childNodes;
  if (children) {
    for (let i = 0; i < children.length; i++) {
      collectTextChunks(children[i], chunks, current);
    }
  }
  if (current.value) {
    chunks.push(current.value);
  }
  let characters = 0;
  for (let i = 0; i < chunks.length; i++) {
    characters += countGraphemes(chunks[i]);
  }
  const words = chunks.length ? countWordsInText(chunks.join(" ")) : 0;
  return { words, characters };
}

export function formatWordCount(words, characters) {
  const wordLabel = words === 1 ? "word" : "words";
  const charLabel = characters === 1 ? "character" : "characters";
  return `${words.toLocaleString()} ${wordLabel} · ${characters.toLocaleString()} ${charLabel}`;
}

export function updateWordCount() {
  if (!dom.wordCount) {
    return;
  }
  if (!state.showWordCount) {
    return;
  }
  const { words, characters } = countWordsAndCharacters(dom.noteArea);
  dom.wordCount.textContent = formatWordCount(words, characters);
}

export function setWordCountEnabled(enabled) {
  state.showWordCount = Boolean(enabled);
  if (dom.wordCountBtn) {
    dom.wordCountBtn.setAttribute("aria-checked", state.showWordCount ? "true" : "false");
  }
  if (dom.wordCount) {
    dom.wordCount.classList.toggle("hidden", !state.showWordCount);
  }
  if (state.showWordCount) {
    updateWordCount();
  }
}
