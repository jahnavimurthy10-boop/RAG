# Papertrail: Chat with your documents

A local-first Retrieval-Augmented Generation (RAG) workshop app. Upload PDF or DOCX files, split their text into overlapping chunks, create local embeddings with Ollama, retrieve the most relevant chunks using cosine similarity, and ask an Ollama chat model to answer from those sources.

Documents and embeddings are kept in memory for this running server process. The app does not send document content to a hosted API. Scanned PDFs are not OCR'd; they need selectable text to be readable.

## Requirements

- Python 3.9+
- [Ollama](https://ollama.com/) installed and running
- Models pulled locally:

```powershell
ollama pull nomic-embed-text
ollama pull llama3.2
```

## Run locally

From the project directory, create and activate a virtual environment, install dependencies, and start the server:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000). Keep Ollama running in the background. The app uses `nomic-embed-text` for embeddings and `llama3.2` for answers by default. Override them with environment variables:

```powershell
$env:OLLAMA_BASE_URL = "http://localhost:11434"
$env:OLLAMA_EMBED_MODEL = "nomic-embed-text"
$env:OLLAMA_CHAT_MODEL = "llama3.2"
```

## Try it

1. Upload one or more text-based PDF or DOCX files (up to 20 MB each).
2. Select the sources the assistant may use.
3. Ask a question. The response includes the retrieved filename and chunk for each source.
4. Unselect a file to exclude it from retrieval, or remove it to delete it from this server session.

## How the RAG flow works

1. **Extract:** `pypdf` reads PDF page text; `python-docx` reads paragraphs and tables from DOCX.
2. **Chunk:** text is split into chunks of about 1,000 characters with 150 characters of overlap.
3. **Embed:** Ollama's `/api/embed` endpoint generates a vector for each chunk.
4. **Retrieve:** the question is embedded, then cosine similarity ranks the selected document chunks; the best four are used.
5. **Generate:** retrieved passages and the question are sent to Ollama's `/api/chat` endpoint with instructions to stay grounded in the passages.

## API

- `GET /api/documents` — list uploaded documents
- `POST /api/documents` — upload one or more `files` (multipart form data)
- `DELETE /api/documents/{document_id}` — remove a document and its chunks
- `POST /api/chat` — JSON body: `{"question": "...", "document_ids": ["..."]}`

The `document_ids` field can be omitted to search all uploaded documents.

## Tests

```powershell
python -m pytest
```
