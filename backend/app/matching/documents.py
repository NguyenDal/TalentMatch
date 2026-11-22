"""Read bounded resume uploads for job matching, writing tools and job search."""

import PyPDF2
from docx import Document
from docx.opc.constants import RELATIONSHIP_TYPE as RT
from docx.oxml.ns import qn
from docx.text.paragraph import Paragraph
from fastapi import HTTPException, UploadFile

from app.matching.document_limits import validate_docx_size
from app.matching.limits import MAX_PDF_PAGES, MAX_RESUME_BYTES, MAX_RESUME_CHARACTERS


def bounded_text(parts):
    chunks, size = [], 0
    for part in parts:
        size += len(part) + (1 if chunks else 0)
        if size > MAX_RESUME_CHARACTERS:
            raise HTTPException(413, "Please use a resume with 40,000 characters or fewer.")
        chunks.append(part)
    return "\n".join(chunks)


def docx_paragraphs(document):
    # Read actual header/footer parts once, including shared section headers.
    # Traversing the XML in order includes paragraphs inside tables and text boxes.
    parts = {RT.HEADER: [], RT.FOOTER: []}
    seen = set()
    for rel in document.part.rels.values():
        if rel.reltype in parts and not rel.is_external and rel.target_part.partname not in seen:
            parts[rel.reltype].append(rel.target_part.element)
            seen.add(rel.target_part.partname)
    for root in (*parts[RT.HEADER], document.element.body, *parts[RT.FOOTER]):
        for paragraph in root.iter(qn("w:p")):
            yield Paragraph(paragraph, document).text


def extract_text(upload: UploadFile) -> str:
    name = (upload.filename or "").lower()
    if name.endswith(".pdf"):
        pages = PyPDF2.PdfReader(upload.file).pages
        if len(pages) > MAX_PDF_PAGES:
            raise HTTPException(413, "Please choose a resume with 25 pages or fewer.")
        return bounded_text(page.extract_text() or "" for page in pages)
    if name.endswith(".docx"):
        validate_docx_size(upload.file)
        return bounded_text(docx_paragraphs(Document(upload.file)))
    if name.endswith(".txt"):
        return upload.file.read().decode("utf-8-sig")
    raise HTTPException(422, "Please upload a PDF, DOCX, or TXT resume.")


def read_resume(upload: UploadFile) -> str:
    upload.file.seek(0, 2)
    size = upload.file.tell()
    upload.file.seek(0)
    if size > MAX_RESUME_BYTES:
        raise HTTPException(413, "Please choose a resume under 5 MB.")
    try:
        text = extract_text(upload).strip()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(422, "We couldn’t read this resume. Please upload a readable, unencrypted PDF, DOCX, or UTF-8 TXT file.") from exc
    if not text:
        raise HTTPException(422, "No readable text was found in this resume. For a scanned PDF, use a text-based version instead.")
    if len(text) > MAX_RESUME_CHARACTERS:
        raise HTTPException(413, "Please use a resume with 40,000 characters or fewer.")
    return text
