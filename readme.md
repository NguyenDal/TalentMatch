# TalentMatch

A web app to check how well your resume matches a job description, see detailed requirement breakdown, and get personalized job application insights.

---

## Features

- Upload a resume (PDF or TXT)
- Paste a job description
- Instantly see a match score and which requirements are met/missing
- Get smart, tailored Q&A for your application
- User-friendly, modern interface with profile + trends

---

## Requirements

- Python 3.10+
- Node.js (v16+ recommended)
- npm (comes with Node.js)
- [OpenAI API Key](https://platform.openai.com/)
- PostgreSQL database (Neon Free is supported)
---

## Setup Instructions

### 1. Clone the Repository
git clone https://github.com/NguyenDal/Resume-Matcher.git
cd Resume-Matcher

### 2. Backend Setup (FastAPI)

Run these commands from the repository root:

```powershell
cd backend
py -m venv venv
.\venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

On macOS/Linux, use `python3 -m venv venv` and `source venv/bin/activate`.

Keep secrets in `backend/.env`. Existing deployment environment variables take
precedence over this file. Set `DATABASE_URL` to your PostgreSQL connection string,
including Neon's TLS parameters, and keep your existing OpenAI, JWT, email, and S3
configuration. Never put database credentials in the frontend.

```dotenv
DATABASE_URL="postgresql://USER:PASSWORD@NEON_HOST/talentmatch?sslmode=require&channel_binding=require"
OPENAI_API_KEY=your_openai_api_key_here
SECRET_KEY=replace_with_a_random_secret_of_at_least_32_characters
FRONTEND_URL=http://localhost:3000
```

Start the server from `backend`:

```powershell
python -m uvicorn app.main:app --reload
```

Without an activated virtual environment on Windows, use
`py -m uvicorn app.main:app --reload`. The module is `app.main`, because the file
is `backend/app/main.py`. The API runs at http://localhost:8000.

### 3. Frontend Setup (React)
Open a new terminal at the repository root:

- cd frontend
- npm install
- npm start
- The frontend runs at: http://localhost:3000

- Open http://localhost:3000 in your browser.

- Upload your resume and paste the job description.

- Click Check Match.

- Review your match score, see detailed requirement breakdown, and use the fit Q&A for preparation.

### Google sign-in and account setup

Create a **Web application** OAuth client in Google Cloud under a TalentMatch
project. Configure its consent screen and authorize this exact local redirect
(including the trailing slash):

```text
http://localhost:8000/auth/google/callback/
```

Keep the credentials in `backend/.env` only:

```dotenv
GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:8000/auth/google/callback/
FRONTEND_URL=http://localhost:3000
GOOGLE_COOKIE_SAMESITE=lax
```

Install the backend requirements, then migrate the database **before** running
the updated app. Test the migration on an isolated database branch first. For
Neon, use a direct connection for this command, supplied as `DATABASE_URL` in
the process environment; continue using the pooled URL for application traffic.

```powershell
cd backend
python -B -m app.migrate_google_auth
python -m uvicorn app.main:app --reload
```

The migration is transactional and can be run again. It removes `first_name`
and `last_name`, allows a null password hash, adds Google identity and temporary
authentication tables, and enforces case-insensitive username/email uniqueness.
It stops without merging accounts if existing names or emails collide.
Restart the backend after changing OAuth credentials or other environment values.

Both Login and Signup offer **Continue with Google**. New Google users choose
only a unique username (3–30 letters, digits, or underscores); availability is
checked live and enforced again in PostgreSQL. Their accounts have no password
until they use **Settings → Set password**. Google names and photos are not stored.

An existing email requires explicit link confirmation. Verified local accounts
retain their password. If an unverified local email is reclaimed through an
authoritative Google identity, the confirmation explains that the old password
is removed and prior sessions are revoked. Google accounts using non-Gmail,
non-Workspace email must prove the existing local password before linking.

The backend requests only `openid email`, verifies the Google identity token,
and binds one-time state and completion tickets to an HttpOnly browser cookie.
The frontend accepts popup messages only from the configured API origin and
the popup it opened. Secrets and authentication tickets never appear in redirect
URLs. The OAuth callback authorization code is exchanged by the backend.

For deployment, add the exact HTTPS backend callback in Google Cloud, set
`GOOGLE_REDIRECT_URI` and `FRONTEND_URL` to the deployed URLs, and build the
frontend with `REACT_APP_API_URL=https://your-api.example.com`. Prefer frontend
and API domains under the same site. If they are on different sites, set
`GOOGLE_COOKIE_SAMESITE=none` with an HTTPS callback; browsers that block third-party
cookies may still prevent completion, so a same-site API/reverse proxy is preferable.
Use Google's Audience settings to manage test access and complete branding
requirements before publishing the OAuth app for general use.

Auth regression checks:

```powershell
# From backend
python -B -m unittest discover -s tests -p "test_google_auth.py"
# From frontend
npm test -- --watchAll=false --runInBand
npm run build
```

### 4. Troubleshooting
#### CORS error?
Ensure the backend allows http://localhost:3000 in CORSMiddleware settings.

#### OpenAI key not found?
Double-check your .env file and restart the backend after updating it.

#### PDF extraction fails?
Use a non-password-protected, standard PDF.

#### Dependency errors?
Upgrade pip: pip install --upgrade pip and try again.

### 5. Security
#### a. Password Hashing

- User passwords are never stored in plain text.

- When you register, your password is “hashed” using a strong algorithm (bcrypt or similar).

- This means even if someone accesses the database, they can’t see or use your password.

- During login, your password is checked by comparing the hash, not the real password.

#### b. User Authentication & JWT Tokens

- After a successful login, the backend gives you an access token (called a JWT – JSON Web Token).

- This token acts like a digital key, letting you access your own data or protected endpoints.

- The token contains only your basic info (user id, email, and expiry date), and it’s cryptographically signed, so it cannot be tampered with.

#### c. Protected API Routes

- Some API routes (like /me/ or other user data) require you to send your JWT token.

- If you don’t include the token, or it’s expired/invalid, access is denied.

- This makes sure that only logged-in users can see or edit their own info.

#### d. CORS (Cross-Origin Resource Sharing)

- The backend is configured to only accept requests from your frontend (for example, http://localhost:3000).

- This helps block unwanted requests from other websites or sources.

#### e. Environment Variables

- Sensitive information (like your OpenAI API key and secret keys) should always go in your .env file.

- Never commit your .env to git or share it publicly.

### 6. Database

TalentMatch uses PostgreSQL through SQLAlchemy and psycopg2. `DATABASE_URL` selects
the host; there is no automatic SQLite fallback. User accounts, password hashes,
login events, and sessions are stored in PostgreSQL. Uploaded image files remain
in S3; their URLs are stored in the database.

#### Neon setup

1. Create a project on Neon's **Free** plan, preferably in a region close to the
   backend. Keep PostgreSQL at the same or a newer major version than the source.
2. In **Connect**, copy the TLS-enabled connection string. Use the pooled host
   for application traffic and the direct host for `pg_dump` / `pg_restore`.
3. Preserve existing data using the migration steps below **before** changing
   the application's `DATABASE_URL`.
4. After verification, update `DATABASE_URL` in `backend/.env` and in the backend
   hosting service's environment variables, then restart/redeploy the backend.
   The frontend does not need database credentials or a database host change.

The Free plan has storage, compute, and transfer limits; check
[Neon's current plan limits](https://neon.com/pricing) before importing a database.
The database hostname changes, but existing passwords and S3 URLs can be retained.

#### Preserve an existing database

Keep the old database and its connection details until migration and application
checks pass. Never delete its service or storage volume to create the replacement.
If the source is offline, restore access or obtain a PostgreSQL backup first.
Creating tables on Neon does **not** transfer existing accounts.

For a small database, use PostgreSQL's `pg_dump` and `pg_restore` tools with a client
version at least as new as the source server. Before the final dump, stop
application writes until the destination has been verified and the app switched.

Use a custom-format dump and restore into an empty database using the **direct**
Neon connection. Supply connection details securely through your environment or
a protected connection file; do not commit passwords or backups. `.backups/` is
ignored by Git for local migration archives.

```text
pg_dump --format=custom --no-owner --no-acl --file=talentmatch.dump
pg_restore --no-owner --no-acl --exit-on-error --single-transaction --dbname=TARGET_DATABASE talentmatch.dump
```

The dump command uses the source connection environment; the restore command
must use the destination connection environment. See
[Neon's PostgreSQL migration instructions](https://neon.com/docs/import/migrate-from-postgres)
for connection parameters and command options. Do not initialize the ORM tables
before restoring an archive that already contains the schema.

Compare source/destination schema, exact row counts, foreign keys, and sequences.
From `backend`, check the configured database without printing account records:

```powershell
python -m app.check_tables
```

This verifies the expected tables and columns and prints row counts. Also check
an existing account's login and profile after cutover. Retain the source and
backup until these checks pass; switching back after new writes requires data
reconciliation.

#### Fresh databases only

If no existing data needs to be preserved, create the tables from `backend`:

```powershell
python -m app.init_db
python -m app.check_tables
```

`init_db` creates missing tables; it does not migrate existing data, alter old
columns, or reset a database. The application does not initialize tables at startup.

### 7. License
Apache License.
Feel free to use, fork, or contribute!
