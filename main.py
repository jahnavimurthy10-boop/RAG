from __future__ import annotations

import os
from pathlib import Path
from typing import Dict, List, Optional, Union

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app.services.documents import extract_text
from app.services.ollama import OllamaClient, OllamaError
from app.services.rag import RagService

MAX_UPLOAD_BYTES = 20 * 1024 * 1024
WEB_DIR = Path(__file__).resolve().parent.parent / "web"

ollama = OllamaClient(
    base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
    embedding_model=os.getenv("OLLAMA_EMBED_MODEL", "nomic-embed-text"),
    chat_model=os.getenv("OLLAMA_CHAT_MODEL", "llama3.2"),
)
rag = RagService(ollama)

app = FastAPI(title="Local Document Chat", version="1.0.0")
app.mount("/static", StaticFiles(directory=WEB_DIR / "static"), name="static")


class ChatRequest(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    document_ids: Optional[List[str]] = None


@app.get("/", include_in_schema=False)
async def index() -> FileResponse:
    return FileResponse(WEB_DIR / "index.html")


@app.get("/api/documents")
async def list_documents() -> List[Dict[str, Union[str, int]]]:
    return list(rag.documents.values())


@app.post("/api/documents", status_code=201)
async def upload_documents(
    files: List[UploadFile] = File(...),
) -> List[Dict[str, Union[str, int]]]:
    if not files:
        raise HTTPException(status_code=400, detail="Choose at least one PDF or DOCX file.")

    added: list[dict[str, str | int]] = []
    for upload in files:
        filename = upload.filename or "document"
        if not filename.lower().endswith((".pdf", ".docx")):
            raise HTTPException(
                status_code=400,
                detail=f"{filename}: unsupported file type. Upload a PDF or DOCX file.",
            )
        content = await upload.read(MAX_UPLOAD_BYTES + 1)
        if len(content) > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"{filename}: file exceeds the 20 MB upload limit.",
            )
        try:
            text = extract_text(filename, content)
            added.append(await rag.add_document(filename, text))
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=f"{filename}: {exc}") from exc
        except OllamaError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
    return added


@app.delete("/api/documents/{document_id}", status_code=204)
async def delete_document(document_id: str) -> None:
    if not rag.remove_document(document_id):
        raise HTTPException(status_code=404, detail="Document not found.")


@app.post("/api/chat")
async def chat(request: ChatRequest) -> dict[str, object]:
    question = request.question.strip()
    if not question:
        raise HTTPException(status_code=422, detail="Question cannot be blank.")
    try:
        answer, sources = await rag.answer(question, request.document_ids)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except OllamaError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"answer": answer, "sources": sources}
