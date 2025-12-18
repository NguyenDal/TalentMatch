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
from sqlalchemy import or_
from app.auth import hash_password, verify_password
from app.models import User, LoginEvent
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

def safe_json_parse(content):
    """Try to safely parse a JSON array/object from AI response text."""
    try:
        match = re.search(r'\[\s*{.*}\s*\]', content, re.DOTALL)
        if match:
            return json.loads(match.group(0))
        return json.loads(content)
    except Exception:
        return [{"requirement": "AI Extraction Error", "explanation": content}]

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
    filename = file.filename.lower()
    if filename.endswith('.pdf'):
        return extract_text_from_pdf(file.file)
    elif filename.endswith('.docx'):
        return extract_text_from_docx(file.file)
    else:
        # Treat everything else as plain text
        return file.file.read().decode("utf-8", errors="ignore")

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
client = openai.OpenAI(api_key=openai_api_key)
MODEL = "gpt-4.1-nano"

# === Requirement Extraction Functions ===

def extract_requirements_gpt(job_desc):
    """Ask OpenAI to extract explicit/implicit requirements from job posting."""
    system_prompt = (
        "Extract a detailed JSON array of all explicit and implicit job requirements from the following job description. "
        "For each requirement, include the field 'requirement' (a short title), and 'explanation' (concise reason/context for why it's needed). "
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
        temperature=0.2,
        max_tokens=800,
    )
    requirements = safe_json_parse(response.choices[0].message.content)
    return requirements

def match_requirements_gpt(resume_text, requirements):
    """
    Ask OpenAI to compare the parsed requirements and the user's resume,
    and return which requirements are clearly met or missing.
    """
    system_prompt = (
        "You are a helpful HR assistant. For each job requirement below, check if the candidate resume CLEARLY meets the requirement. "
        "For each, output an object: {'requirement': <requirement>, 'met': true/false, 'explanation': <very short explanation>}. "
        "Be strict—if the requirement is not CLEARLY met in the resume, set 'met': false."
    )
    req_list = [
        {"requirement": r["requirement"], "explanation": r.get("explanation", "")}
        for r in requirements
    ]
    user_prompt = (
        f"Job requirements:\n{json.dumps(req_list, indent=2)}\n\n"
        f"Candidate resume:\n{resume_text}\n\n"
        "Return a JSON array as specified."
    )
    response = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.2,
        max_tokens=1800,
    )
    match_results = safe_json_parse(response.choices[0].message.content)
    return match_results

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
        temperature=0.5,
        max_tokens=600,
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
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Change in prod!
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# === Resume Upload & Analysis Endpoint ===

@app.post("/upload-resume/")
async def upload_resume(
    resume: UploadFile = File(...),
    job_description: str = Form(...)
):
    """
    Receive user's resume file and job description,
    extract requirements and match using AI, return match data.
    """
    try:
        resume_text = extract_text(resume)
        job_text = job_description

        requirements = extract_requirements_gpt(job_text)
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
            if r.get("met") is True or str(r.get("met")).lower() == "true":
                met_requirements.append(req)
            else:
                missing_requirements.append(req)

        score = ai_match_score(resume_text, job_text)

        # Extra AI Q&A for user guidance
        system_prompt = (
            "You are a smart job matching assistant. Analyze the following job description and resume. "
            "1. Suggest up to 5 very relevant, dynamic, and context-specific questions a candidate might want to ask about their fit or preparation for this job (DO NOT use generic questions; infer from the specific job). "
            "2. For each question, give a clear answer based on the resume and job description. "
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
            temperature=0.3,
            max_tokens=700,
        )
        ai_suggestions = safe_json_parse(response.choices[0].message.content)

        return {
            "scores": [score],
            "met_requirements": met_requirements,
            "missing_requirements": missing_requirements,
            "requirement_explanations": requirement_explanations,
            "ai_suggestions": ai_suggestions,
        }
    except Exception as e:
        return {
            "scores": [0.0],
            "met_requirements": [],
            "missing_requirements": [],
            "requirement_explanations": {},
            "ai_suggestions": [{"question": "Error", "answer": str(e)}],
        }

# === USER REGISTRATION ENDPOINT ===

@app.post("/register/")
def register_user(
    username: str = Form(...),
    first_name: str = Form(...),
    last_name: str = Form(...),
    email: str = Form(...),
    password: str = Form(...),
    db: Session = Depends(get_db)
):
    """
    Register a new user account (requires unique username and email).
    """
    # Uniqueness checks
    if db.query(User).filter(User.username == username).first():
        raise HTTPException(status_code=400, detail="Username already registered")
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    # Hash password
    hashed_pw = hash_password(password)

    # Create user with first/last name populated
    new_user = User(
        username=username.strip(),
        email=email.strip().lower(),
        hashed_password=hashed_pw,
        first_name=first_name.strip(),
        last_name=last_name.strip(),
    )

    db.add(new_user)
    try:
        db.commit()
        db.refresh(new_user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Registration failed")

    return {
        "id": new_user.id,
        "username": new_user.username,
        "email": new_user.email,
        "first_name": new_user.first_name,
        "last_name": new_user.last_name,
    }

# === USER LOGIN ENDPOINT ===

@app.post("/login/")
async def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    remember: bool = Form(False),
    db: Session = Depends(get_db),
):
    """
    Login with either username or email.
    Returns a JWT token and basic user info on success.
    Also records a login event for history.
    """
    user = db.query(User).filter(
        or_(
            User.email == form_data.username,
            User.username == form_data.username
        )
    ).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect username/email or password")

    # NEW: per-session ID for remote logout
    session_id = secrets.token_urlsafe(16)

    # Build JWT payload
    SECRET_KEY = os.getenv("SECRET_KEY", "your-fallback-secret")
    ALGORITHM = "HS256"
    payload = {
        "sub": user.username,
        "user_id": user.id,
        "email": user.email,
        "username": user.username,
        "sid": session_id,  # <-- important
    }
    if not remember:
        payload["exp"] = datetime.utcnow() + timedelta(days=1)

    token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

    # --- Record login event ---
    x_forwarded_for = request.headers.get("x-forwarded-for")
    if x_forwarded_for:
        client_ip = x_forwarded_for.split(",")[0].strip()
    else:
        client_ip = request.client.host if request.client else "Unknown"

    user_agent = request.headers.get("user-agent", "Unknown device")
    location = await geo_lookup(client_ip)

    login_event = LoginEvent(
        user_id=user.id,
        ip=client_ip,
        user_agent=user_agent,
        location=location,
        session_id=session_id,
        active=True,
    )
    db.add(login_event)
    db.commit()

    return {
        "access_token": token,
        "token_type": "bearer",
        "user_id": user.id,
        "username": user.username,
        "email": user.email,
    }

# === JWT-Protected User Info Endpoint ===

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")
ALGORITHM = "HS256"
SECRET_KEY = os.getenv("SECRET_KEY", "your-fallback-secret")

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    """
    Decode the JWT token, find the user, and ensure the session is still active.
    Used for endpoints that require login.
    """
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        session_id: str = payload.get("sid")

        if username is None:
            raise credentials_exception

        user = db.query(User).filter(User.username == username).first()
        if user is None:
            raise credentials_exception

        # If the token has a session id, verify it's still active
        if session_id:
            active_session = (
                db.query(LoginEvent)
                .filter(
                    LoginEvent.user_id == user.id,
                    LoginEvent.session_id == session_id,
                    LoginEvent.active == True,
                )
                .first()
            )
            if active_session is None:
                # Session was revoked or never existed
                raise credentials_exception

        return user
    except JWTError:
        raise credentials_exception

@app.get("/me/")
def read_users_me(current_user: User = Depends(get_current_user)):
    """Get details about the currently logged-in user (JWT required)."""
    return {
        "id": current_user.id,
        "username": current_user.username,
        "full_name": current_user.full_name,
        "first_name": current_user.first_name,
        "last_name": current_user.last_name,
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
    user = db.query(User).filter(User.reset_token == token).first()
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
    user = db.query(User).filter(User.reset_token == token).first()
    if not user or not user.verify_reset_token(token):
        raise HTTPException(status_code=400, detail="Invalid or expired reset token.")

    # Hash and set the new password
    user.hashed_password = hash_password(new_password)
    user.clear_reset_token()
    db.commit()

    return {"ok": True, "message": "Password has been reset successfully."}

# --- PROFILE UPDATE ENDPOINT ---
@app.patch("/profile/update/")
def update_profile(
    first_name: str = Form(None),
    last_name: str = Form(None),
    email: str = Form(None),
    profession: str = Form(None),
    bio: str = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if first_name is not None:
        current_user.first_name = first_name.strip()
    if last_name is not None:
        current_user.last_name = last_name.strip()
    if email is not None:
        current_user.email = email.strip().lower()
    if profession is not None:
        current_user.profession = profession.strip()
    if bio is not None:
        current_user.bio = bio.strip()
    db.commit()
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
    current_user: User = Depends(get_current_user),
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
        if new_username and new_username != current_user.username:
            existing_user = (
                db.query(User)
                .filter(User.username == new_username, User.id != current_user.id)
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
                .filter(User.email == new_email, User.id != current_user.id)
                .first()
            )
            if existing_email:
                raise HTTPException(
                    status_code=400,
                    detail="This email is already registered. Try logging in instead.",
                )

            # validate format
            try:
                validate_email(new_email)
            except EmailNotValidError as e:
                raise HTTPException(status_code=400, detail=str(e))

            # apply new email + mark as unverified, clear any previous code
            current_user.email = new_email
            email_changed = True

            # these attrs need to exist on your User model
            current_user.email_verified = False
            current_user.email_verification_code = None
            current_user.email_verification_expires_at = None

    db.commit()
    db.refresh(current_user)

    return {
        "ok": True,
        "email_changed": email_changed,
        "email_verified": bool(getattr(current_user, "email_verified", False)),
    }

@app.post("/account/send-verification/")
async def send_verification_email(
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
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
    current_user: User = Depends(get_current_user),
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

# --- SECURITY: Change password while logged in ---

@app.post("/account/change-password/")
def change_password(
    current_password: str = Form(...),
    new_password: str = Form(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Change the user's password while logged in.
    Requires the current password and a new password.
    """
    # Verify current password
    if not verify_password(current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")

    # Basic new password checks
    if len(new_password) < 8:
        raise HTTPException(
            status_code=400,
            detail="New password must be at least 8 characters long.",
        )

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
    token: str = Depends(oauth2_scheme),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Return recent login activity for the user.

    - First row: current session (built from the request)
    - Next rows: last 5 stored login events (most recent first)
    """
    # Decode token to get current session_id
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        current_sid = payload.get("sid")
    except JWTError:
        current_sid = None

    # Current session info (doesn't come from DB)
    x_forwarded_for = request.headers.get("x-forwarded-for")
    if x_forwarded_for:
        client_ip = x_forwarded_for.split(",")[0].strip()
    else:
        client_ip = request.client.host if request.client else "Unknown"

    user_agent = request.headers.get("user-agent", "Unknown device")
    location = await geo_lookup(client_ip)

    events = []

    # Current session row (for the blue "Current device" pill)
    events.append({
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "ip": client_ip,
        "device": user_agent,
        "location": location,
        "current_session": True,
        "session_id": current_sid,
    })

    # Last 5 login events from history (excluding current session, if known)
    query = (
        db.query(LoginEvent)
        .filter(LoginEvent.user_id == current_user.id)
        .order_by(LoginEvent.timestamp.desc())
    )
    if current_sid:
        query = query.filter(LoginEvent.session_id != current_sid)

    history = query.limit(5).all()

    for ev in history:
        events.append({
            "timestamp": ev.timestamp.isoformat() + "Z",
            "ip": ev.ip,
            "device": ev.user_agent,
            "location": ev.location or "Location unavailable",
            "current_session": False,
            "session_id": ev.session_id,
        })

    return {"events": events}


# --- SECURITY: 'Log out' a past session (history only) ---

@app.post("/account/logout-session/")
def logout_past_session(
    payload: LogoutSessionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Remotely log out a past session by marking it inactive.
    Any future requests using that JWT will fail.

    This does NOT log out your *current* device; it is for other sessions.
    """
    session_id = (payload.session_id or "").strip()
    if not session_id:
        raise HTTPException(status_code=400, detail="Missing session_id")

    ev = (
        db.query(LoginEvent)
        .filter(
            LoginEvent.user_id == current_user.id,
            LoginEvent.session_id == session_id,
        )
        .first()
    )

    if not ev:
        raise HTTPException(status_code=404, detail="Session not found.")

    ev.active = False
    db.commit()
    return {"ok": True, "message": "Session has been logged out remotely."}

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
