"""Public employer postings. Cached data is shared and contains no applicant information."""

from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from html import unescape
from html.parser import HTMLParser
import json
import re
from threading import Lock
from time import monotonic
from urllib.parse import urlsplit

import httpx

from app.matching.job_terms import skills_in, title_terms


BOARDS = {"d2l": "D2L", "affirm": "Affirm", "mozilla": "Mozilla"}
EMPLOYER_DOMAINS = {"d2l": "d2l.com", "affirm": "affirm.com", "mozilla": "mozilla.org"}
API = "https://boards-api.greenhouse.io/v1/boards"
FEED_BYTES = 8 * 1024 * 1024
DETAIL_BYTES = 512 * 1024


class DescriptionParser(HTMLParser):
    headings = {"h1", "h2", "h3", "h4", "h5", "h6"}
    paragraphs = {"br", "p", "div", "tr", "section", "article", "blockquote"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.blocks = []
        self.list_types = []
        self.in_item = 0
        self.in_heading = 0
        self.in_bold = 0
        self.has_unbolded_text = False
        self.has_markup = False
        self.ignored = 0

    def flush(self):
        text = " ".join("".join(self.parts).split())
        if text:
            if self.in_item:
                kind = self.list_types[-1] if self.list_types else "ul"
            elif self.in_heading or (not self.has_unbolded_text and len(text) <= 100):
                kind = "heading"
            else:
                kind = "paragraph"
            self.blocks.append((kind, text))
        self.parts.clear()
        self.has_unbolded_text = False

    def boundary(self, tag):
        if tag in self.headings or tag in {"ul", "ol", "li"}:
            self.flush()
        elif tag in self.paragraphs:
            if self.in_item:
                self.parts.append(" ")
            else:
                self.flush()
        elif tag in {"td", "th"}:
            self.parts.append(" ")

    def handle_starttag(self, tag, attrs):
        self.has_markup = True
        if tag in {"style", "script"}:
            self.ignored += 1
        if self.ignored:
            return
        self.boundary(tag)
        if tag in {"ul", "ol"}:
            self.list_types.append(tag)
        elif tag == "li":
            self.in_item += 1
        elif tag in self.headings:
            self.in_heading += 1
        elif tag in {"b", "strong"}:
            self.in_bold += 1

    def handle_endtag(self, tag):
        if tag in {"style", "script"}:
            self.ignored = max(0, self.ignored - 1)
            return
        if self.ignored:
            return
        self.boundary(tag)
        if tag in {"ul", "ol"} and self.list_types:
            self.list_types.pop()
        elif tag == "li":
            self.in_item = max(0, self.in_item - 1)
        elif tag in self.headings:
            self.in_heading = max(0, self.in_heading - 1)
        elif tag in {"b", "strong"}:
            self.in_bold = max(0, self.in_bold - 1)

    def handle_data(self, data):
        if not self.ignored:
            self.parts.append(data)
            if not self.in_bold and data.strip():
                self.has_unbolded_text = True


def description_blocks(content):
    if not isinstance(content, str):
        return []
    # Greenhouse's JSON normally contains HTML escaped as text.
    if re.search(r"&lt;/?[a-z][^&]*?(?:&gt;|\s)", content, re.IGNORECASE):
        content = unescape(content)
    parser = DescriptionParser()
    parser.feed(content)
    parser.close()
    if not parser.has_markup:
        lines = (" ".join(line.split()) for line in "".join(parser.parts).splitlines())
        return [("paragraph", line) for line in lines if line]
    parser.flush()
    return parser.blocks


def plain_description(content):
    return "\n".join(text for _, text in description_blocks(content))


def description_sections(blocks):
    """Keep employer headings and group consecutive list items for the reader."""
    sections = []
    for kind, text in blocks:
        if kind == "heading":
            sections.append({"title": text, "blocks": []})
            continue
        if not sections:
            sections.append({"title": "", "blocks": []})
        body = sections[-1]["blocks"]
        if kind == "paragraph":
            body.append({"type": "paragraph", "text": text})
        elif body and body[-1]["type"] == kind:
            body[-1]["items"].append(text)
        else:
            body.append({"type": kind, "items": [text]})
    return sections


def public_json(url, limit, params=None):
    deadline = monotonic() + 18
    with httpx.stream("GET", url, params=params, timeout=httpx.Timeout(8, connect=4)) as response:
        response.raise_for_status()
        body = bytearray()
        for chunk in response.iter_bytes(chunk_size=65536):
            if len(body) + len(chunk) > limit or monotonic() > deadline:
                raise ValueError("Public job response exceeded limits.")
            body.extend(chunk)
    payload = json.loads(body)
    if not isinstance(payload, dict):
        raise ValueError("Invalid public job response.")
    return payload


def posting_url(board, job_id, supplied):
    fallback = f"https://job-boards.greenhouse.io/{board}/jobs/{job_id}"
    if not isinstance(supplied, str) or "\\" in supplied:
        return fallback
    try:
        parsed = urlsplit(supplied)
        host = parsed.hostname or ""
        domain = EMPLOYER_DOMAINS[board]
        if (parsed.scheme == "https" and not parsed.username and not parsed.password
                and parsed.port in (443, None)
                and (host == domain or host.endswith("." + domain) or host.endswith(".greenhouse.io"))):
            return supplied
    except ValueError:
        pass
    return fallback


@dataclass(frozen=True, slots=True)
class Job:
    id: int
    board: str
    title: str
    location: str
    url: str
    description: str
    updated: str
    skills: frozenset
    title_terms: frozenset


def fetch_board(board):
    payload = public_json(f"{API}/{board}/jobs", FEED_BYTES, params={"content": "true"})
    rows = payload.get("jobs")
    if not isinstance(rows, list) or len(rows) > 3000:
        raise ValueError("Invalid public board.")
    jobs = []
    for row in rows:
        if not isinstance(row, dict) or type(row.get("id")) is not int or row["id"] < 1:
            continue
        title = row.get("title")
        if not isinstance(title, str) or not title.strip():
            continue
        location = row.get("location")
        location = location.get("name") if isinstance(location, dict) else ""
        title = unescape(title).strip()
        description = plain_description(row.get("content"))
        jobs.append(Job(row["id"], board, title,
                        unescape(location).strip() if isinstance(location, str) else "",
                        posting_url(board, row["id"], row.get("absolute_url")), description,
                        row["updated_at"] if isinstance(row.get("updated_at"), str) else "",
                        skills_in(title + "\n" + description), title_terms(title)))
    return tuple(jobs)


@dataclass(frozen=True, slots=True)
class BoardSnapshot:
    jobs: tuple
    last_success: float | None
    next_attempt: float
    failed: bool


class PublicBoards:
    """Refresh each due board once. Failures retain recent data for at most an hour."""

    def __init__(self, fetch=fetch_board, clock=monotonic):
        self.fetch = fetch
        self.clock = clock
        self.snapshots = {}
        self.lock = Lock()

    def listings(self):
        with self.lock:
            now = self.clock()
            due = [key for key in BOARDS if key not in self.snapshots or self.snapshots[key].next_attempt <= now]
            if due:
                with ThreadPoolExecutor(max_workers=len(due)) as pool:
                    pending = {key: pool.submit(self.fetch, key) for key in due}
                    for key, future in pending.items():
                        try:
                            jobs = future.result()
                            self.snapshots[key] = BoardSnapshot(jobs, self.clock(), self.clock() + 600, False)
                        except (httpx.HTTPError, ValueError):
                            old = self.snapshots.get(key)
                            self.snapshots[key] = BoardSnapshot(old.jobs if old else (), old.last_success if old else None,
                                                               self.clock() + 60, True)
            jobs, unavailable, stale = [], [], []
            for key, snapshot in self.snapshots.items():
                if snapshot.last_success is None or self.clock() - snapshot.last_success > 3600:
                    unavailable.append(BOARDS[key])
                else:
                    jobs.extend(snapshot.jobs)
                    if snapshot.failed:
                        stale.append(BOARDS[key])
            return jobs, unavailable, stale
