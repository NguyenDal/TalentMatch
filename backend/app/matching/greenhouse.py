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


class DescriptionText(HTMLParser):
    blocks = {"br", "p", "div", "li", "ul", "ol", "h1", "h2", "h3", "h4", "tr", "section"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.ignored = 0

    def handle_starttag(self, tag, attrs):
        if tag in {"style", "script"}:
            self.ignored += 1
        elif not self.ignored and tag in self.blocks:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in {"style", "script"}:
            self.ignored = max(0, self.ignored - 1)
        elif not self.ignored and tag in self.blocks:
            self.parts.append("\n")

    def handle_data(self, data):
        if not self.ignored:
            self.parts.append(data)


def plain_description(content):
    if not isinstance(content, str):
        return ""
    # Greenhouse's JSON normally contains HTML escaped as text.
    if re.search(r"&lt;/?[a-z][^&]*?(?:&gt;|\s)", content, re.IGNORECASE):
        content = unescape(content)
    parser = DescriptionText()
    parser.feed(content)
    parser.close()
    lines = (" ".join(line.split()) for line in "".join(parser.parts).splitlines())
    return "\n".join(line for line in lines if line)


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
