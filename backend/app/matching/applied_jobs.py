"""A user's confirmed applications, including postings since removed by the employer."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.authentication.sessions import get_current_user
from app.infrastructure.database import get_db
from app.matching.greenhouse import BOARDS, posting_url
from app.matching.job_search import require_search_budget
from app.models import AppliedJob, User


router = APIRouter()


class PostingSnapshot(BaseModel):
    title: str = Field(min_length=1, max_length=1024)
    location: str = Field(default="", max_length=1024)
    url: str = Field(max_length=8192)


def listing(record):
    return {"board": record.board, "id": record.job_id, "company": BOARDS[record.board],
            "title": record.title, "location": record.location, "url": record.url}


@router.get("/applied-jobs/")
def applied_jobs(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    records = (db.query(AppliedJob).filter_by(user_id=user.id)
               .order_by(AppliedJob.applied_at.desc(), AppliedJob.board, AppliedJob.job_id).all())
    return {"jobs": [listing(record) for record in records]}


@router.put("/applied-jobs/{board}/{job_id}/", dependencies=[Depends(require_search_budget)])
def confirm_application(board: str, job_id: int, snapshot: PostingSnapshot,
                        user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if board not in BOARDS or not 0 < job_id < 2**63 or not snapshot.title.strip():
        raise HTTPException(422, "Choose a valid employer posting.")
    key = (user.id, board, job_id)
    existing = db.get(AppliedJob, key)
    if existing:
        return listing(existing)
    record = AppliedJob(user_id=user.id, board=board, job_id=job_id, title=snapshot.title.strip(),
                        location=snapshot.location.strip(), url=posting_url(board, job_id, snapshot.url))
    db.add(record)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = db.get(AppliedJob, key)
        if existing is None:
            raise
        return listing(existing)
    return listing(record)
