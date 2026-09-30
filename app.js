const fileInput = document.querySelector("#file-input");
const dropZone = document.querySelector("#drop-zone");
const sourceList = document.querySelector("#source-list");
const sourceCount = document.querySelector("#source-count");
const uploadStatus = document.querySelector("#upload-status");
const chatForm = document.querySelector("#chat-form");
const questionInput = document.querySelector("#question");
const sendButton = document.querySelector(".send-button");
const conversation = document.querySelector("#conversation");
let documents = [];
let busy = false;

function setStatus(message, isError = false) {
  uploadStatus.textContent = message;
  uploadStatus.classList.toggle("error", isError);
}

function updateComposer() {
  const hasSelection = documents.some((document) => document.selected);
  questionInput.disabled = !hasSelection || busy;
  sendButton.disabled = !hasSelection || busy || !questionInput.value.trim();
}

function renderDocuments() {
  sourceCount.textContent = String(documents.length);
  sourceList.replaceChildren();
  if (!documents.length) {
    const empty = document.createElement("div");
    empty.className = "empty-sources";
    empty.textContent = "Your uploaded files will appear here.";
    sourceList.append(empty);
  }

  for (const sourceDocument of documents) {
    const item = document.createElement("div");
    item.className = "source-item";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = sourceDocument.selected;
    checkbox.setAttribute("aria-label", `Use ${sourceDocument.name} as a source`);
    checkbox.addEventListener("change", () => {
      sourceDocument.selected = checkbox.checked;
      updateComposer();
    });
    const icon = document.createElement("span");
    icon.className = `file-icon ${sourceDocument.name.toLowerCase().endsWith(".docx") ? "docx" : ""}`;
    icon.textContent = sourceDocument.name.toLowerCase().endsWith(".docx") ? "DOC" : "PDF";
    const meta = document.createElement("span");
    meta.className = "source-meta";
    const name = document.createElement("strong");
    name.textContent = sourceDocument.name;
    name.title = sourceDocument.name;
    const details = document.createElement("small");
    details.textContent = `${sourceDocument.chunk_count} text ${sourceDocument.chunk_count === 1 ? "chunk" : "chunks"}`;
    meta.append(name, details);
    const remove = document.createElement("button");
    remove.className = "remove-source";
    remove.type = "button";
    remove.title = `Remove ${sourceDocument.name}`;
    remove.setAttribute("aria-label", `Remove ${sourceDocument.name}`);
    remove.textContent = "×";
    remove.addEventListener("click", () => deleteDocument(sourceDocument.id));
    item.append(checkbox, icon, meta, remove);
    sourceList.append(item);
  }
  updateComposer();
}

async function loadDocuments() {
  try {
    const response = await fetch("/api/documents");
    if (!response.ok) throw new Error("Could not load your document list.");
    const loaded = await response.json();
    const oldSelection = new Map(documents.map((document) => [document.id, document.selected]));
    documents = loaded.map((document) => ({
      ...document,
      selected: oldSelection.has(document.id) ? oldSelection.get(document.id) : true,
    }));
    renderDocuments();
    setStatus("");
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function uploadFiles(fileCollection) {
  const files = [...fileCollection];
  if (!files.length) return;
  const formData = new FormData();
  for (const file of files) formData.append("files", file);
  setStatus(`Preparing ${files.length} ${files.length === 1 ? "file" : "files"}…`);
  fileInput.disabled = true;
  try {
    const response = await fetch("/api/documents", { method: "POST", body: formData });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "Upload failed.");
    setStatus(`Added ${data.length} ${data.length === 1 ? "document" : "documents"} to your library.`);
    await loadDocuments();
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    fileInput.disabled = false;
    fileInput.value = "";
  }
}

async function deleteDocument(documentId) {
  try {
    const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}`, { method: "DELETE" });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.detail || "Could not remove this document.");
    }
    documents = documents.filter((document) => document.id !== documentId);
    renderDocuments();
    setStatus("Document removed.");
  } catch (error) {
    setStatus(error.message, true);
  }
}

function addMessage(role, text, sources = [], isError = false) {
  const row = document.createElement("div");
  row.className = `message ${role}`;
  if (role === "assistant") {
    const mark = document.createElement("span");
    mark.className = "assistant-mark";
    mark.textContent = "✳";
    row.append(mark);
  }
  const wrap = role === "assistant" ? document.createElement("div") : null;
  if (wrap) wrap.className = "answer-wrap";
  const content = document.createElement("div");
  content.className = `message-content${isError ? " error-message" : ""}`;
  content.textContent = text;
  (wrap || row).append(content);
  if (wrap && sources.length) {
    const chips = document.createElement("div");
    chips.className = "sources-used";
    for (const source of sources) {
      const chip = document.createElement("span");
      chip.className = "source-chip";
      chip.textContent = `${source.document} · chunk ${source.chunk}`;
      chips.append(chip);
    }
    wrap.append(chips);
  }
  if (wrap) row.append(wrap);
  conversation.append(row);
  row.scrollIntoView({ behavior: "smooth", block: "nearest" });
  return content;
}

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const question = questionInput.value.trim();
  if (!question || busy) return;
  const documentIds = documents.filter((document) => document.selected).map((document) => document.id);
  document.querySelector("#welcome-card")?.remove();
  addMessage("user", question);
  questionInput.value = "";
  busy = true;
  updateComposer();
  const answerNode = addMessage("assistant", "Searching your sources…");
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, document_ids: documentIds }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "Could not get an answer.");
    answerNode.textContent = data.answer;
    const row = answerNode.closest(".message");
    if (data.sources?.length) {
      const chips = document.createElement("div");
      chips.className = "sources-used";
      for (const source of data.sources) {
        const chip = document.createElement("span");
        chip.className = "source-chip";
        chip.textContent = `${source.document} · chunk ${source.chunk}`;
        chips.append(chip);
      }
      row.querySelector(".answer-wrap").append(chips);
    }
  } catch (error) {
    answerNode.textContent = error.message;
    answerNode.classList.add("error-message");
  } finally {
    busy = false;
    updateComposer();
  }
});

questionInput.addEventListener("input", () => {
  questionInput.style.height = "auto";
  questionInput.style.height = `${Math.min(questionInput.scrollHeight, 150)}px`;
  updateComposer();
});
questionInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    chatForm.requestSubmit();
  }
});
fileInput.addEventListener("change", () => uploadFiles(fileInput.files));
document.querySelector("#refresh-button").addEventListener("click", loadDocuments);
document.querySelector("#select-all").addEventListener("click", () => {
  documents.forEach((document) => { document.selected = true; });
  renderDocuments();
});
for (const eventName of ["dragenter", "dragover"]) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add("dragging");
  });
}
for (const eventName of ["dragleave", "drop"]) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove("dragging");
  });
}
dropZone.addEventListener("drop", (event) => uploadFiles(event.dataTransfer.files));
loadDocuments();
