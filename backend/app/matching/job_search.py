"""Authenticated discovery over a fixed set of public Greenhouse employer boards."""

import re

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
import httpx

from app.authentication.limits import AuthRequestLimiter
from app.authentication.sessions import get_current_user
from app.matching.documents import read_resume
from app.matching.greenhouse import API, BOARDS, DETAIL_BYTES, PublicBoards, description_blocks, description_sections, public_json
from app.matching.job_terms import skills_in, words
from app.models import User


router = APIRouter()
boards = PublicBoards()
search_limiter = AuthRequestLimiter(limit=60, window=300)


def require_search_budget(user: User = Depends(get_current_user)):
    search_limiter.reserve(str(user.id))


def filter_terms(value, max_length):
    value = value.strip()
    if len(value) > max_length:
        raise HTTPException(422, f"Shorten the search field to {max_length} characters or fewer.")
    return tuple(dict.fromkeys(words(value)))


def ranked_listings(jobs, keyword_terms, location_terms, resume_text):
    resume_skills = skills_in(resume_text)
    resume_words = set(words(resume_text))
    keyword_patterns = [re.compile(r"(?<!\w)" + re.escape(term) + r"(?!\w)", re.I) for term in keyword_terms]
    ranked = []
    # A stable secondary ordering keeps more recently updated postings first on ties.
    for job in sorted(jobs, key=lambda item: item.updated, reverse=True):
        if not all(term in job.location.casefold() for term in location_terms):
            continue
        searchable = " ".join((job.title, BOARDS[job.board], job.location, job.description))
        if not all(pattern.search(searchable) for pattern in keyword_patterns):
            continue
        shared_skills = sorted(resume_skills & job.skills)
        shared_title = sorted(resume_words & job.title_terms)
        if resume_text and not (shared_skills or shared_title):
            continue
        normalized_skills = {name.casefold() for name in shared_skills}
        matched_terms = shared_skills + [term for term in shared_title if term not in normalized_skills]
        title_matches = sum(bool(pattern.search(job.title)) for pattern in keyword_patterns)
        key = (title_matches, 2 * len(shared_title) + len(shared_skills))
        ranked.append((key, {"id": job.id, "board": job.board, "company": BOARDS[job.board],
                             "title": job.title, "location": job.location, "url": job.url,
                             "matched_terms": matched_terms}))
    ranked.sort(key=lambda item: item[0], reverse=True)
    return [item for _, item in ranked]


@router.post("/job-search/", dependencies=[Depends(require_search_budget)])
def search_jobs(resume: UploadFile | None = File(None), keywords: str = Form(""), location: str = Form("")):
    keyword_terms = filter_terms(keywords, 200)
    location_terms = filter_terms(location, 120)
    resume_text = read_resume(resume) if resume else ""
    jobs, unavailable, stale = boards.listings()
    if len(unavailable) == len(BOARDS):
        raise HTTPException(503, "The employer job boards are temporarily unavailable. Please try again shortly.")
    return {"jobs": ranked_listings(jobs, keyword_terms, location_terms, resume_text),
            "unavailable_boards": unavailable, "stale_boards": stale}


@router.get("/job-search/{board}/{job_id}/", dependencies=[Depends(require_search_budget)])
def selected_posting(board: str, job_id: int):
    missing = HTTPException(404, "This posting is no longer available. Search again for current openings.")
    if board not in BOARDS or job_id <= 0:
        raise missing
    try:
        # Recheck the single posting so a removed listing cannot prefill a draft.
        payload = public_json(f"{API}/{board}/jobs/{job_id}", DETAIL_BYTES)
        if payload.get("id") != job_id:
            raise ValueError("Mismatched public job.")
        blocks = description_blocks(payload.get("content"))
        if not blocks:
            raise ValueError("Missing public description.")
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code in (404, 410):
            raise missing from exc
        raise HTTPException(503, "The employer could not be reached. Please try again shortly.") from exc
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(503, "The employer’s job description is temporarily unavailable.") from exc
    return {"description": "\n".join(text for _, text in blocks), "description_sections": description_sections(blocks)}
