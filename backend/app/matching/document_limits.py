"""Inspect DOCX archive sizes before loading its XML into memory."""

from zipfile import ZipFile

from fastapi import HTTPException

MAX_DOCX_EXPANDED_BYTES = 20 * 1024 * 1024
MAX_DOCX_XML_BYTES = 2 * 1024 * 1024
MAX_DOCX_MEMBERS = 512


def validate_docx_size(file):
    try:
        with ZipFile(file) as archive:
            members = archive.infolist()
            if (len(members) > MAX_DOCX_MEMBERS
                    or sum(item.file_size for item in members) > MAX_DOCX_EXPANDED_BYTES
                    or any(item.filename.lower().endswith((".xml", ".rels"))
                           and item.file_size > MAX_DOCX_XML_BYTES for item in members)):
                raise HTTPException(413, "This document is too complex to process. Please upload a simpler resume or export it as a PDF.")
    finally:
        file.seek(0)
