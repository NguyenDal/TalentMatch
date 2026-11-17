# === Core Imports ===
from dotenv import load_dotenv
load_dotenv()  # Load secrets from .env for devs
from fastapi import BackgroundTasks
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
import PyPDF2
from docx import Document
import openai
import os
import re
import json
from app.s3_utils import upload_file_to_s3
from uuid import uuid4
import httpx

# === Database & Auth Imports ===
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from sqlalchemy import or_, func
from app.auth import hash_password, verify_password
from app.models import User, LoginEvent, UserSession, GoogleIdentity
from app.auth_sessions import (get_current_user, get_current_user_locked, issue_session, normalized_email, require_username,
    set_initial_password, signing_secret, user_by_email, validate_password, USERNAME_PATTERN)
from app.google_auth import router as google_auth_router, frontend_origin
from app.database import get_db

# === JWT Handling ===
from fastapi.security import OAuth2PasswordRequestForm, OAuth2PasswordBearer
from jose import JWTError, jwt
from datetime import datetime, timedelta
import secrets

# === Email Imports for password reset ===

from fastapi_mail import FastMail, MessageSchema, ConnectionConfig
from email_validator import validate_email, EmailNotValidError
from pydantic import BaseModel

# Read email config from .env
MAIL_USERNAME = os.getenv("MAIL_USERNAME")
MAIL_PASSWORD = os.getenv("MAIL_PASSWORD")
MAIL_FROM = os.getenv("MAIL_FROM")
MAIL_FROM_NAME = os.getenv("MAIL_FROM_NAME", "TalentMatch")
MAIL_SERVER = os.getenv("MAIL_SERVER")
MAIL_PORT = int(os.getenv("MAIL_PORT", 587))
MAIL_STARTTLS = os.getenv("MAIL_STARTTLS", "True") == "True"
MAIL_SSL_TLS = os.getenv("MAIL_SSL_TLS", "False") == "True"

conf = ConnectionConfig(
    MAIL_USERNAME=MAIL_USERNAME,
    MAIL_PASSWORD=MAIL_PASSWORD,
    MAIL_FROM=MAIL_FROM,
    MAIL_FROM_NAME=MAIL_FROM_NAME,
    MAIL_SERVER=MAIL_SERVER,
    MAIL_PORT=MAIL_PORT,
    MAIL_STARTTLS=MAIL_STARTTLS,
    MAIL_SSL_TLS=MAIL_SSL_TLS,
    USE_CREDENTIALS=True,
    VALIDATE_CERTS=True
)

# === Utility Functions ===

class InvalidAnalysisResponse(ValueError):
    """The analysis provider did not return a complete, usable result."""


def safe_json_parse(content):
    """Parse JSON, including a fenced JSON block, without inventing results."""
    if not isinstance(content, str) or not content.strip():
        raise InvalidAnalysisResponse("Missing analysis content")
    content = content.strip()
    fenced = re.fullmatch(r"```(?:json)?\s*(.*?)\s*```", content, re.DOTALL | re.IGNORECASE)
    if fenced:
        content = fenced.group(1)
    try:
        return json.loads(content)
    except (ValueError, TypeError) as exc:
        raise InvalidAnalysisResponse("Invalid analysis JSON") from exc


def analysis_json(response):
    """Reject truncation/refusal before parsing the provider's JSON response."""
    try:
        choice = response.choices[0]
        if choice.finish_reason != "stop":
            raise InvalidAnalysisResponse("Incomplete analysis response")
        return safe_json_parse(choice.message.content)
    except (AttributeError, IndexError, TypeError) as exc:
        raise InvalidAnalysisResponse("Missing analysis response") from exc


def validate_requirements(items):
    if not isinstance(items, list):
        raise InvalidAnalysisResponse("Requirements must be a list")
    result, seen = [], set()
    for item in items:
        if not isinstance(item, dict) or not isinstance(item.get("requirement"), str):
            raise InvalidAnalysisResponse("Invalid requirement")
        title = item["requirement"].strip()
        explanation = item.get("explanation", "")
        if not title or not isinstance(explanation, str):
            raise InvalidAnalysisResponse("Invalid requirement fields")
        if title.casefold() not in seen:
            result.append({"requirement": title, "explanation": explanation.strip()})
            seen.add(title.casefold())
    return result


def validate_matches(items, requirements):
    if not isinstance(items, list):
        raise InvalidAnalysisResponse("Matches must be a list")
    expected = {item["requirement"].casefold(): item["requirement"] for item in requirements}
    result, seen = [], set()
    for item in items:
        if not isinstance(item, dict) or not isinstance(item.get("requirement"), str):
            raise InvalidAnalysisResponse("Invalid match")
        key = item["requirement"].strip().casefold()
        explanation = item.get("explanation", "")
        if (key not in expected or key in seen or type(item.get("met")) is not bool
                or not isinstance(explanation, str)):
            raise InvalidAnalysisResponse("Invalid match fields")
        result.append({"requirement": expected[key], "met": item["met"], "explanation": explanation.strip()})
        seen.add(key)
    if seen != set(expected):
        raise InvalidAnalysisResponse("Incomplete requirement coverage")
    return result


def validate_suggestions(items):
    if not isinstance(items, list):
        raise InvalidAnalysisResponse("Suggestions must be a list")
    result = []
    for item in items:
        if (not isinstance(item, dict)
                or not isinstance(item.get("question"), str) or not item["question"].strip()
                or not isinstance(item.get("answer"), str) or not item["answer"].strip()):
            raise InvalidAnalysisResponse("Invalid suggestion")
        result.append({"question": item["question"].strip(), "answer": item["answer"].strip()})
    return result


def analysis_http_error(error):
    """Map failures to safe public errors; never return provider bodies or keys."""
    if isinstance(error, InvalidAnalysisResponse):
        return HTTPException(status_code=502, detail="The analysis service returned an incomplete or invalid response. Please try again.")
    if isinstance(error, openai.RateLimitError):
        code = getattr(error, "code", None)
        if code in {"insufficient_quota", "billing_hard_limit_reached", "billing_not_active", "usage_limit_reached"}:
            return HTTPException(status_code=503, detail="Matching is unavailable because the analysis service has reached its usage limit. Please contact the site owner.")
        return HTTPException(status_code=429, detail="The matching service is busy. Please wait a moment and try again.", headers={"Retry-After": "30"})
    if isinstance(error, (openai.AuthenticationError, openai.PermissionDeniedError, openai.NotFoundError)):
        return HTTPException(status_code=503, detail="The matching service is not configured correctly. Please contact the site owner.")
    if isinstance(error, openai.APITimeoutError):
        return HTTPException(status_code=504, detail="The matching service took too long to respond. Please try again.")
    if isinstance(error, openai.APIConnectionError):
        return HTTPException(status_code=503, detail="The analysis service could not be reached. Please try again in a moment.")
    if isinstance(error, openai.BadRequestError) and getattr(error, "code", None) == "context_length_exceeded":
        return HTTPException(status_code=422, detail="This resume and job description are too long to analyze together. Please shorten them and try again.")
    if isinstance(error, openai.APIStatusError):
        return HTTPException(status_code=502, detail="The analysis service could not complete this match. Please try again in a moment.")
    return HTTPException(status_code=500, detail="We couldn’t complete this match. Please try again or contact the site owner.")

def extract_text_from_pdf(file):
    """Extract all text from a PDF file (each page)."""
    pdf_reader = PyPDF2.PdfReader(file)
    text = ''
    for page in pdf_reader.pages:
        text += page.extract_text() or ''
    return text

def extract_text_from_docx(file):
    """Extract all text from a Word (.docx) file."""
    document = Document(file)
    return '\n'.join([para.text for para in document.paragraphs])

def extract_text(file: UploadFile):
    """
    Extract text from uploaded file.
    Supports: PDF (.pdf), Word (.docx), and plain text (.txt).
    """
    filename = (file.filename or "").lower()
    if filename.endswith('.pdf'):
        return extract_text_from_pdf(file.file)
    elif filename.endswith('.docx'):
        return extract_text_from_docx(file.file)
    elif filename.endswith('.txt'):
        return file.file.read().decode("utf-8-sig")
    raise HTTPException(status_code=422, detail="Please upload a PDF, DOCX, or TXT resume.")

def clean_explanation(text):
    """Make AI explanations more readable for users."""
    text = text.strip()
    if text and not text[0].isupper():
        text = text[0].upper() + text[1:]
    if text and text[-1] not in ".!?":
        text += "."
    text = re.sub(r'\s{2,}', ' ', text)
    text = re.sub(r'(?<![.?!])\n', '. ', text)
    return text

async def geo_lookup(ip: str) -> str:
    """
    Try to resolve an IP address to a city/region/country using a public GeoIP API.

    - For localhost/private IPs, we call the API without specifying an IP, so it
      uses the server's public IP (works in dev to show e.g. Winnipeg).
    - For real public IPs (e.g., behind a proxy with X-Forwarded-For), we look
      up that exact IP.
    """
    # Decide which URL to call on ipapi
    # Local / private IPs -> call /json/ (use server's external IP)
    if (
        not ip
        or ip in {"localhost", "::1"}
        or ip.startswith("127.")
        or ip.startswith("10.")
        or ip.startswith("192.168.")
        or ip.startswith("172.16.")
        or ip.startswith("172.17.")
        or ip.startswith("172.18.")
        or ip.startswith("172.19.")
        or ip.startswith("172.20.")
        or ip.startswith("172.21.")
        or ip.startswith("172.22.")
        or ip.startswith("172.23.")
        or ip.startswith("172.24.")
        or ip.startswith("172.25.")
        or ip.startswith("172.26.")
        or ip.startswith("172.27.")
        or ip.startswith("172.28.")
        or ip.startswith("172.29.")
        or ip.startswith("172.30.")
        or ip.startswith("172.31.")
    ):
        lookup_url = "https://ipapi.co/json/"
    else:
        # Public IP: look up that specific client IP
        lookup_url = f"https://ipapi.co/{ip}/json/"

    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.get(lookup_url)
            if resp.status_code != 200:
                return "Location unavailable"

            data = resp.json()
            city = data.get("city")
            region = data.get("region")
            country = data.get("country_name")

            parts = [p for p in [city, region, country] if p]
            if parts:
                return ", ".join(parts)
    except Exception:
        # Fail gracefully if API fails
        pass

    return "Location unavailable"

# === OPENAI SETUP ===

openai_api_key = os.getenv("OPENAI_API_KEY")
client = openai.OpenAI(api_key=openai_api_key) if openai_api_key else None
MODEL = os.getenv("OPENAI_MODEL", "gpt-6-luna").strip() or "gpt-6-luna"


def completion_options(temperature, token_limit):
    """Use the current model's token/temperature contract, with legacy support."""
    if MODEL.startswith("gpt-6") or re.match(r"^gpt-5\.[1-9]\d*(?:-|$)", MODEL):
        return {"max_completion_tokens": token_limit, "reasoning_effort": "none"}
    if re.match(r"^gpt-5(?:-(?:mini|nano))?(?:-\d{4}-\d{2}-\d{2})?$", MODEL):
        return {"max_completion_tokens": token_limit, "reasoning_effort": "minimal"}
    if MODEL.startswith(("gpt-5", "o1", "o3", "o4")):
        return {"max_completion_tokens": token_limit}
    return {"max_tokens": token_limit, "temperature": temperature}

# === Requirement Extraction Functions ===

def extract_requirements_gpt(job_desc):
    """Extract concise, distinct requirements supported by the job posting."""
    system_prompt = (
        "Extract a concise JSON array of the job requirements supported by the following job description. "
        "Do not infer requirements the posting does not state. Deduplicate repeated or equivalent requirements, "
        "while keeping distinct skills and qualifications separate. "
        "For each requirement, include 'requirement' (a short title) and 'explanation' (at most one brief sentence of context). "
        "Only include requirements that could be checked on a resume (e.g., years of experience, education, certifications, security clearance, eligibility, skills, language, work location, schedule, etc). "
        "Format: [{\"requirement\": \"...\", \"explanation\": \"...\"}]"
    )
    user_prompt = f"Job Description:\n{job_desc}\n\nExtract the requirements as a JSON list."
    response = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        **completion_options(temperature=0.2, token_limit=4096),
    )
    return validate_requirements(analysis_json(response))

def match_requirements_gpt(resume_text, requirements):
    """
    Ask OpenAI to compare the parsed requirements and the user's resume,
    and return which requirements are clearly met or missing.
    """
    system_prompt = (
        "You are a helpful HR assistant. For each job requirement below, check if the candidate resume CLEARLY meets the requirement. "
        "For each, output an object: {'requirement': <requirement>, 'met': true/false, 'explanation': <one brief sentence citing resume evidence or the missing evidence>}. "
        "Be strict—if the requirement is not CLEARLY met in the resume, set 'met': false. "
        "Return every original requirement exactly once, preserving its title. Use JSON booleans, not strings."
    )
    req_list = [
        {"requirement": r["requirement"], "explanation": r.get("explanation", "")}
        for r in requirements
    ]
    user_prompt = (
        f"Job requirements:\n{json.dumps(req_list, separators=(',', ':'), ensure_ascii=False)}\n\n"
        f"Candidate resume:\n{resume_text}\n\n"
        "Return a JSON array as specified."
    )
    response = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        **completion_options(temperature=0.2, token_limit=4096),
    )
    return validate_matches(analysis_json(response), requirements)

def ai_match_score(resume_text, job_text):
    """Simple overlap score for resume and job text as a backup."""
    resume_words = set(re.findall(r'\w+', resume_text.lower()))
    job_words = set(re.findall(r'\w+', job_text.lower()))
    overlap = resume_words.intersection(job_words)
    return len(overlap) / (len(job_words) + 1e-5)

# === PROFILE TRENDS (AI-ONLY) ===

def generate_profile_trends(profession, bio):
    """
    Use GPT to generate up to 10 career-related 'trends' for the user
    based only on their profession and bio.

    Each item has:
    {
      "title": "short main text",
      "subtitle": "1–2 sentence explanation",
      "tag": "#Something",
      "type": "topic|skill|career-path",
      "url": null
    }
    """
    profession = (profession or "").strip()
    bio = (bio or "").strip()

    # If BOTH are missing => do not generate trends
    if not profession and not bio:
        return []

    system_prompt = (
        "You are a career and job-search assistant. "
        "Given a user's profession and short bio, suggest up to 10 highly relevant topics, "
        "skills, or job-market trends they should pay attention to. "
        "Each item should feel like something you could show in a 'Trends for you' sidebar "
        "on a profile page.\n\n"
        "Return ONLY a JSON array, no explanations. Each item must have:\n"
        "{'title': 'short main text', 'subtitle': '1–2 sentence explanation', "
        "'tag': '#Something', 'type': 'topic', 'url': null}\n"
        "You may set 'type' to 'topic', 'skill', or 'career-path'."
    )

    user_prompt = (
        f"User profession: {profession or 'Not specified'}\n"
        f"User bio: {bio or 'Not specified'}\n\n"
        "Generate the JSON array now."
    )

    response = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        **completion_options(temperature=0.5, token_limit=1024),
    )

    raw = response.choices[0].message.content
    parsed = safe_json_parse(raw)

    if not isinstance(parsed, list):
        return []

    trends = []
    for item in parsed:
        title = (item.get("title") or "").strip()
        if not title:
            continue

        subtitle = clean_explanation(item.get("subtitle") or "")
        tag = (item.get("tag") or "").strip()
        ttype = (item.get("type") or "topic").strip()
        url = item.get("url", None)

        trends.append({
            "title": title,
            "subtitle": subtitle,
            "tag": tag,
            "type": ttype,
            "url": url,
        })

    return trends[:10]

# ---- Pydantic models for security endpoints ----

class LogoutSessionRequest(BaseModel):
    """Payload to 'log out' a past session by its session_id."""
    session_id: str

# === FASTAPI APPLICATION SETUP ===

app = FastAPI()
app.include_router(google_auth_router)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_origin()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# === Resume Upload & Analysis Endpoint ===

@app.post("/upload-resume/")
def upload_resume(
    resume: UploadFile = File(...),
    job_description: str = Form(...)
):
    """
    Receive user's resume file and job description,
    extract requirements and match using AI, return match data.
    """
    job_text = job_description.strip()
    if not job_text:
        raise HTTPException(status_code=422, detail="Please paste a job description before checking your match.")
    try:
        resume_text = extract_text(resume).strip()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=422, detail="We couldn’t read this resume. Please upload a readable, unencrypted PDF, DOCX, or UTF-8 TXT file.") from exc
    if not resume_text:
        raise HTTPException(status_code=422, detail="No readable text was found in this resume. For a scanned PDF, use a text-based version instead.")
    if client is None:
        raise HTTPException(status_code=503, detail="The matching service is not configured yet. Please contact the site owner.")

    try:
        requirements = extract_requirements_gpt(job_text)
        if not requirements:
            raise HTTPException(status_code=422, detail="No resume-checkable requirements were identified in this job description. Please include the role’s responsibilities and qualifications.")
        match_results = match_requirements_gpt(resume_text, requirements)

        met_requirements = []
        missing_requirements = []
        requirement_explanations = {}

        for r in match_results:
            req = r["requirement"]
            orig_expl = next((x.get("explanation") for x in requirements if x["requirement"] == req), "")
            ai_expl = r.get("explanation", "")
            explanation = orig_expl
            if ai_expl:
                if explanation and not explanation.endswith("."):
                    explanation += "."
                if explanation:
                    explanation += " "
                explanation += ai_expl
            explanation = clean_explanation(explanation)
            requirement_explanations[req] = explanation
            if r["met"]:
                met_requirements.append(req)
            else:
                missing_requirements.append(req)

        score = ai_match_score(resume_text, job_text)

        # Extra AI Q&A for user guidance
        system_prompt = (
            "You are a smart job matching assistant. Analyze the following job description and resume. "
            "1. Suggest at most 3 focused, job-specific questions a candidate might ask about their fit or preparation. Do not use generic or repetitive questions. "
            "2. Answer each question using the resume and job description in at most 2 concise sentences. Do not invent experience. "
            "Format your answer as a JSON list like this: "
            '[{\"question\": \"...\", \"answer\": \"...\"}]'
        )
        user_prompt = (
            f"Job Description:\n{job_text}\n\nResume:\n{resume_text}\n\n"
            "Return only the JSON list."
        )
        response = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            **completion_options(temperature=0.3, token_limit=2048),
        )
        ai_suggestions = validate_suggestions(analysis_json(response))

        return {
            "scores": [score],
            "met_requirements": met_requirements,
            "missing_requirements": missing_requirements,
            "requirement_explanations": requirement_explanations,
            "ai_suggestions": ai_suggestions,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise analysis_http_error(exc) from exc

# === USER REGISTRATION ENDPOINT ===

@app.post("/register/")
def register_user(
    username: str = Form(...),
    email: str = Form(...),
    password: str = Form(...),
    db: Session = Depends(get_db)
):
    username = require_username(db, username)
    try:
        email = validate_email(email.strip(), check_deliverability=False).normalized.lower()
    except EmailNotValidError:
        raise HTTPException(status_code=400, detail="Enter a valid email address.")
    if user_by_email(db, email):
        raise HTTPException(status_code=409, detail="Email already registered. Please log in instead.")
    validate_password(password)
    new_user = User(username=username, email=email, hashed_password=hash_password(password))
    db.add(new_user)
    try:
        db.commit()
        db.refresh(new_user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="That username or email is already registered.")
    return {"id": new_user.id, "username": new_user.username, "email": new_user.email}

# === USER LOGIN ENDPOINT ===

@app.post("/login/")
async def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    remember: bool = Form(False),
    db: Session = Depends(get_db),
):
    client_ip = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    if not client_ip:
        client_ip = request.client.host if request.client else "Unknown"
    # Finish network work before taking the account lock. Never await while
    # holding it: another synchronous DB query could block this event loop.
    location = await geo_lookup(client_ip)
    identifier = form_data.username.strip().lower()
    user = db.query(User).filter(or_(
        func.lower(func.trim(User.email)) == identifier,
        func.lower(func.trim(User.username)) == identifier,
    )).with_for_update().populate_existing().first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect username/email or password")
    return issue_session(user, request, db, remember, location=location)

# Require an explicit secret for every active authentication path.
ALGORITHM = "HS256"
SECRET_KEY = signing_secret()

@app.get("/me/")
def read_users_me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get details about the currently logged-in user (JWT required)."""
    return {
        "id": current_user.id,
        "username": current_user.username,
        "has_password": bool(current_user.hashed_password),
        "google_linked": db.query(GoogleIdentity.id).filter(GoogleIdentity.user_id == current_user.id).first() is not None,
        "email": current_user.email,
        "email_verified": bool(getattr(current_user, "email_verified", False)),
        "profile_image_url": current_user.profile_image_url,
        "profession": current_user.profession,
        "bio": current_user.bio,
    }

# --- PROFILE TRENDS ENDPOINT ---

@app.get("/profile/trends/")
def get_profile_trends(current_user: User = Depends(get_current_user)):
    """
    Return AI-generated 'trends for you' based on the user's profession and bio.
    """
    profession = current_user.profession or ""
    bio = current_user.bio or ""

    try:
        trends = generate_profile_trends(profession, bio)
    except Exception:
        trends = []

    return {"trends": trends}

# --- PASSWORD RESET: Step 2a - Generate and return a password reset token ---

@app.post("/request-password-reset/")
async def request_password_reset(
    background_tasks: BackgroundTasks,
    email: str = Form(...),
    db: Session = Depends(get_db)
):
    """
    Generates a secure password reset token for the given email and sends it as a reset link via email.
    """
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found with this email.")
    try:
        # Validate email
        validate_email(email)
    except EmailNotValidError as e:
        raise HTTPException(status_code=400, detail=str(e))

    user.generate_reset_token(expires_in=3600)  # 1 hour expiry
    db.commit()

    # Password reset link
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
    reset_link = f"{frontend_url}/reset-password?token={user.reset_token}"

    # Compose email
    message = MessageSchema(
        subject="Password Reset Request - TalentMatch",
        recipients=[email],
        body=f"""Hello {user.username},

You requested a password reset for your TalentMatch account.

Click the link below to set a new password. This link will expire in 1 hour:

{reset_link}

If you did not request this, just ignore this email.

Thanks,
TalentMatch Team
""",
        subtype="plain"
    )
    fm = FastMail(conf)
    # Send email in the background
    background_tasks.add_task(fm.send_message, message)

    return {"ok": True, "message": "Password reset email sent if the email exists in our records."}


# --- PASSWORD RESET: Step 2b - Verify a password reset token ---

@app.post("/verify-password-reset/")
def verify_password_reset(token: str = Form(...), db: Session = Depends(get_db)):
    """
    Verifies the given reset token. If valid and not expired, returns OK.
    """
    user = db.query(User).filter(User.reset_token == token).with_for_update().first()
    if not user or not user.verify_reset_token(token):
        raise HTTPException(status_code=400, detail="Invalid or expired reset token.")
    return {"ok": True, "user_id": user.id, "username": user.username, "email": user.email}

# --- PASSWORD RESET: Step 3 - Reset the user's password using the token ---

@app.post("/reset-password/")
def reset_password(
    token: str = Form(...),
    new_password: str = Form(...),
    db: Session = Depends(get_db)
):
    """
    Reset the user's password using a valid reset token.
    """
    user = db.query(User).filter(User.reset_token == token).with_for_update().first()
    if not user or not user.verify_reset_token(token):
        raise HTTPException(status_code=400, detail="Invalid or expired reset token.")

    validate_password(new_password)
    # Hash and set the new password
    user.hashed_password = hash_password(new_password)
    user.clear_reset_token()
    db.commit()

    return {"ok": True, "message": "Password has been reset successfully."}

# --- PROFILE UPDATE ENDPOINT ---
@app.patch("/profile/update/")
def update_profile(
    email: str = Form(None),
    profession: str = Form(None),
    bio: str = Form(None),
    current_user: User = Depends(get_current_user_locked),
    db: Session = Depends(get_db),
):
    if email is not None:
        try:
            new_email = validate_email(email.strip(), check_deliverability=False).normalized.lower()
        except EmailNotValidError:
            raise HTTPException(status_code=400, detail="Enter a valid email address.")
        existing = user_by_email(db, new_email)
        if existing and existing.id != current_user.id:
            raise HTTPException(status_code=409, detail="This email is already registered.")
        if normalized_email(current_user.email) != new_email:
            current_user.email = new_email
            current_user.email_verified = False
            current_user.email_verification_code = None
            current_user.email_verification_expires_at = None
            current_user.clear_reset_token()
    if profession is not None:
        current_user.profession = profession.strip()
    if bio is not None:
        current_user.bio = bio.strip()
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="That username or email is already registered.")
    db.refresh(current_user)
    return {"ok": True}

# --- PROFILE IMAGE UPLOAD ENDPOINT ---

@app.post("/upload-profile-image/")
async def upload_profile_image(
    image: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Uploads a profile image for the authenticated user, stores it in S3, and saves the URL in the database.
    """
    # Optional: Check allowed file types
    allowed_types = {"image/jpeg", "image/png", "image/webp"}
    if image.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Unsupported image type")

    # Generate a filename (you can use user ID for uniqueness)
    filename = f"user_{current_user.id}_{uuid4().hex}.{image.filename.split('.')[-1]}"

    # Upload to S3
    s3_url = upload_file_to_s3(image, filename=filename, folder="avatars/")
    if not s3_url:
        raise HTTPException(status_code=500, detail="Failed to upload image to S3")

    # Update the user's profile_image_url in the database
    current_user.profile_image_url = s3_url
    db.commit()
    db.refresh(current_user)

    return {"ok": True, "profile_image_url": s3_url}

# --- PROFILE IMAGE CLEAR ENDPOINT ---

@app.post("/profile/clear-image/")
def clear_profile_image(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    current_user.profile_image_url = None
    db.commit()
    return {"ok": True}

# === ACCOUNT SETTINGS ENDPOINTS ===

@app.patch("/account/update/")
async def update_account(
    background_tasks: BackgroundTasks,
    username: str = Form(None),
    email: str = Form(None),
    current_user: User = Depends(get_current_user_locked),
    db: Session = Depends(get_db),
):
    """
    Update username and/or primary email.
    - Checks uniqueness.
    - If email changed, mark as unverified.
      The user must click "Send verification code" separately to receive a code.
    """
    email_changed = False

    # --- Username update ---
    if username is not None:
        new_username = username.strip()
        if not USERNAME_PATTERN.fullmatch(new_username):
            raise HTTPException(status_code=400, detail="Use 3–30 letters, numbers, or underscores.")
        if new_username != current_user.username:
            existing_user = (
                db.query(User)
                .filter(func.lower(func.trim(User.username)) == new_username.lower(), User.id != current_user.id)
                .first()
            )
            if existing_user:
                raise HTTPException(
                    status_code=400,
                    detail="This username is already taken. Please choose another.",
                )
            current_user.username = new_username

    # --- Email update ---
    if email is not None:
        new_email = email.strip().lower()
        if new_email and new_email != current_user.email:
            existing_email = (
                db.query(User)
                .filter(func.lower(func.trim(User.email)) == new_email, User.id != current_user.id)
                .first()
            )
            if existing_email:
                raise HTTPException(
                    status_code=400,
                    detail="This email is already registered. Try logging in instead.",
                )

            # validate format
            try:
                validate_email(new_email, check_deliverability=False)
            except EmailNotValidError as e:
                raise HTTPException(status_code=400, detail=str(e))

            # apply new email + mark as unverified, clear any previous code
            current_user.email = new_email
            current_user.clear_reset_token()
            email_changed = True

            # these attrs need to exist on your User model
            current_user.email_verified = False
            current_user.email_verification_code = None
            current_user.email_verification_expires_at = None

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="That username or email is already registered.")
    db.refresh(current_user)

    return {
        "ok": True,
        "email_changed": email_changed,
        "email_verified": bool(getattr(current_user, "email_verified", False)),
    }

@app.post("/account/send-verification/")
async def send_verification_email(
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user_locked),
    db: Session = Depends(get_db),
):
    """
    Send / resend a 6-digit verification code to the user's current primary email.
    Can be used even if they didn't just change the email.
    """
    email = (current_user.email or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="No primary email on file.")

    # Optional: block resends if already verified
    if getattr(current_user, "email_verified", False):
        raise HTTPException(status_code=400, detail="Email is already verified.")

    # generate verification code – use model helper if present
    if hasattr(current_user, "generate_email_verification_code"):
        code = current_user.generate_email_verification_code(expires_in_minutes=20)
    else:
        # Fallback: simple 6-digit code
        code = f"{secrets.randbelow(1_000_000):06d}"
        current_user.email_verification_code = code
        current_user.email_verification_expires_at = datetime.utcnow() + timedelta(
            minutes=20
        )
        current_user.email_verified = False

    db.commit()
    db.refresh(current_user)

    fm = FastMail(conf)
    message = MessageSchema(
        subject="Verify your email - TalentMatch",
        recipients=[email],
        body=f"""Hi {current_user.username},

Here is your TalentMatch email verification code:

{code}

This code will expire in 20 minutes.

If you did not request this, you can safely ignore this email.

Thanks,
TalentMatch Team
""",
        subtype="plain",
    )
    background_tasks.add_task(fm.send_message, message)

    return {"ok": True, "message": "Verification code sent."}


@app.post("/account/verify-email/")
def verify_email_code(
    code: str = Form(...),
    current_user: User = Depends(get_current_user_locked),
    db: Session = Depends(get_db),
):
    """
    Verify the user's email with the 6-digit code.
    """
    # Ensure fields exist even if DB not migrated yet
    verification_code = getattr(current_user, "email_verification_code", None)
    verification_expires_at = getattr(
        current_user, "email_verification_expires_at", None
    )

    if not verification_code:
        raise HTTPException(status_code=400, detail="No verification code on file.")

    if code.strip() != verification_code:
        raise HTTPException(status_code=400, detail="Invalid verification code.")

    if verification_expires_at and verification_expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Verification code has expired.")

    current_user.email_verified = True
    current_user.email_verification_code = None
    current_user.email_verification_expires_at = None

    db.commit()
    db.refresh(current_user)

    return {"ok": True, "email_verified": True}

@app.post("/account/set-password/")
def set_password(
    new_password: str = Form(...),
    current_user: User = Depends(get_current_user_locked),
    db: Session = Depends(get_db),
):
    return set_initial_password(db, current_user.id, new_password)

# --- SECURITY: Change password while logged in ---

@app.post("/account/change-password/")
def change_password(
    current_password: str = Form(...),
    new_password: str = Form(...),
    current_user: User = Depends(get_current_user_locked),
    db: Session = Depends(get_db),
):
    """
    Change the user's password while logged in.
    Requires the current password and a new password.
    """
    current_user = db.query(User).filter(User.id == current_user.id).with_for_update().populate_existing().one()
    # Verify current password
    if not verify_password(current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")

    validate_password(new_password)

    if verify_password(new_password, current_user.hashed_password):
        raise HTTPException(
            status_code=400,
            detail="New password must be different from the current password.",
        )

    # Save new password
    current_user.hashed_password = hash_password(new_password)
    db.commit()
    db.refresh(current_user)

    return {"ok": True, "message": "Password changed successfully."}

# --- SECURITY: Recent login activity (stub) ---

@app.get("/account/login-activity/")
async def get_login_activity(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Return recent *active* login sessions for the user.
    Only login_events rows with active = True are shown.
    Very old sessions are filtered out by timestamp.
    """
    # Get current session id from the Authorization header
    auth_header = request.headers.get("authorization") or request.headers.get("Authorization")
    current_sid = None
    if auth_header and auth_header.lower().startswith("bearer "):
        raw_token = auth_header.split(" ", 1)[1]
        try:
            payload = jwt.decode(raw_token, SECRET_KEY, algorithms=[ALGORITHM])
            current_sid = payload.get("sid")
        except JWTError:
            current_sid = None

    now = datetime.utcnow()
    # treat sessions older than 30 days as "expired" for display purposes
    cutoff = now - timedelta(days=30)

    active_events = (
        db.query(LoginEvent)
        .filter(
            LoginEvent.user_id == current_user.id,
            LoginEvent.active == True,          # only active sessions
            LoginEvent.timestamp >= cutoff,     # hide very old ones
        )
        .order_by(LoginEvent.timestamp.desc())
        .all()
    )

    events = []
    for ev in active_events:
        events.append({
            "timestamp": ev.timestamp.isoformat() + "Z",
            "ip": ev.ip,
            "device": ev.user_agent,
            "location": ev.location or "Location unavailable",
            "current_session": (ev.session_id == current_sid),
            "session_id": ev.session_id,
        })

    return {"events": events}


# --- SECURITY: 'Log out' a past session (history only) ---

@app.post("/account/logout-session/")
def logout_session(
    body: LogoutSessionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Mark a specific login_events row as inactive.
    Frontend passes {"session_id": "..."}.
    """
    session_row = (
        db.query(LoginEvent)
        .filter(
            LoginEvent.user_id == current_user.id,
            LoginEvent.session_id == body.session_id,
        )
        .first()
    )

    if not session_row:
        raise HTTPException(status_code=404, detail="Session not found.")

    if not session_row.active:
        return {"ok": True, "message": "Session already logged out."}

    session_row.active = False
    db.commit()

    return {"ok": True, "message": "Session logged out."}

@app.post("/account/logout-all-sessions/")
def logout_all_sessions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Log out the current user from ALL devices/browsers.

    - Marks all their sessions as inactive (or deletes them).
    - Frontend should then clear the local token and redirect to /login.
    """
    # Revoke all rows in user_sessions for this user (if table used)
    # Note: UserSession model uses 'revoked' flag instead of 'active'
    (
        db.query(UserSession)
        .filter(UserSession.user_id == current_user.id)
        .update({"revoked": True}, synchronize_session=False)
    )

    # Optional: also mark related login_events as inactive, if you use that flag
    db.query(LoginEvent).filter(LoginEvent.user_id == current_user.id).update(
        {"active": False}, synchronize_session=False
    )

    db.commit()
    return {"ok": True, "message": "All sessions logged out."}

@app.delete("/account/delete/")
def delete_account(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Permanently delete the current user's account.
    Frontend should show a strong confirmation
    ('Are you sure? This action cannot be undone.')
    before calling this endpoint.
    """
    db.delete(current_user)
    db.commit()
    return {"ok": True, "message": "Account deleted."}
