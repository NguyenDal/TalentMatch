"""Typical Word resume layouts contribute to every tool's same bounded text."""

from io import BytesIO
import unittest

from docx import Document
from docx.enum.section import WD_SECTION
from fastapi import HTTPException, UploadFile

from app.matching.documents import read_resume


def uploaded(document):
    buffer = BytesIO()
    document.save(buffer)
    return UploadFile(file=buffer, filename="sample.docx")


class ResumeDocumentTests(unittest.TestCase):
    def test_contacts_tables_and_linked_headers_in_reading_order(self):
        document = Document()
        section = document.sections[0]
        section.header.paragraphs[0].text = "Alex Sample · alex@example.test"
        document.add_paragraph("Experience")
        table = document.add_table(rows=1, cols=2)
        table.cell(0, 0).text = "Reporting analyst"
        table.cell(0, 1).text = "Wrote SQL reports."
        document.add_paragraph("Education")
        document.add_section(WD_SECTION.NEW_PAGE)
        document.add_paragraph("Additional projects")
        section.footer.paragraphs[0].text = "Portfolio: example.test/alex"
        text = read_resume(uploaded(document))
        self.assertEqual([line for line in text.splitlines() if line], [
            "Alex Sample · alex@example.test", "Experience", "Reporting analyst", "Wrote SQL reports.",
            "Education", "Additional projects", "Portfolio: example.test/alex",
        ])

    def test_table_only_resume_and_shared_character_bound(self):
        document = Document()
        cell = document.add_table(rows=1, cols=1).cell(0, 0)
        cell.text = "Built a Python reporting tool."
        self.assertEqual(read_resume(uploaded(document)), cell.text)
        document.sections[0].header.paragraphs[0].text = "x" * 40_000
        with self.assertRaises(HTTPException) as result:
            read_resume(uploaded(document))
        self.assertEqual(result.exception.status_code, 413)
