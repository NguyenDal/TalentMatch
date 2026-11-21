# TalentMatch

A web app to check how well your resume matches a job description, see detailed requirement breakdown, and get personalized job application insights.

[Open TalentMatch](https://talentmatch-2fmb.onrender.com/)

---

## Features

- Upload a resume (PDF, DOCX, or TXT)
- Paste a job description
- Instantly see a match score and which requirements are met/missing
- Get smart, tailored Q&A for your application
- User-friendly, modern interface with profile + trends

---

## Requirements

- Python 3.10+
- Node.js 22+ (the production build uses Node 22)
- npm (comes with Node.js)
- [OpenAI API Key](https://platform.openai.com/)
- PostgreSQL database (Neon Free is supported)
---

## Setup Instructions

### 1. Clone the Repository

```sh
git clone https://github.com/NguyenDal/TalentMatch.git
cd TalentMatch
```

### Repository layout

| Directory | Contents |
| --- | --- |
| `backend/app/` | FastAPI entry point and database models, with packages for authentication, matching, infrastructure, and database commands |
| `backend/tests/` | API, database, and service regression tests |
| `frontend/src/pages/` | Route components and styles grouped by feature |
| `frontend/src/components/` | Shared authentication, navigation, and theme controls |
| `frontend/src/tests/` | React component, flow, and utility tests |
| `frontend/public/` | Static files included in the web build |

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
OPENAI_MODEL=gpt-6-luna
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

### AI model and usage

The default model is `gpt-6-luna`, selected for low-cost requirement extraction,
resume comparison, and application Q&A. Set `OPENAI_MODEL` in the backend
environment to override it; restart the backend after changing this value.
Do not use the retired `gpt-4.1-nano` model.

Each match uses three text requests: extract the posting's requirements, compare
them with the resume, and generate up to three short application Q&A items.
GPT-6 Luna runs with `reasoning_effort=none`; output is capped at 4,096, 4,096,
and 2,048 tokens respectively. These are ceilings, not fixed token charges.
Prompts request concise explanations and avoid duplicate requirements. Profile
trends use the same model with a 1,024-token output cap.

As of November 16, 2026, standard GPT-6 Luna text pricing is $0.10 per million
input tokens and $0.50 per million output tokens. For example, a complete match
using 10,000 input and 3,000 output tokens across its requests costs about
$0.0025, before any cache savings. Actual usage depends on document lengths and
generated output. Check the [current model pricing](https://developers.openai.com/api/docs/models/gpt-6-luna)
before estimating production costs.

Provider outages, model configuration errors, and invalid responses return
explicit HTTP errors. The interface keeps the selected file and job description
available for retry; a failed analysis is never displayed as a zero-score match.

Matching regression checks (mocked provider calls, no API credit usage):

```powershell
# From backend
python -B -m unittest discover -s tests -p "test_match_analysis.py"
```

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

For deployment, add the exact HTTPS backend callback in Google Cloud. On Render,
the backend derives its frontend origin and callback from `RENDER_EXTERNAL_URL`;
`FRONTEND_URL` and `GOOGLE_REDIRECT_URI` can override these defaults. Elsewhere,
set both variables to the deployed URLs. The production
frontend uses its own origin by default; `REACT_APP_API_URL` is only needed
when intentionally hosting the API elsewhere. Prefer frontend and API on the
same origin. If they are on different sites, set
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

### 4. Render Free deployment

Use one **Docker Web Service** on Render's **Free** compute plan and keep the
existing Neon Free PostgreSQL database. The root `Dockerfile` builds React with
Node 22, then serves the compiled frontend and FastAPI together using Python 3.13.
Select the repository root as the Docker build context, `Dockerfile` as the
Dockerfile path, and leave the service root directory unset. Do not select
`backend/Dockerfile` for this combined deployment. The container runs one Uvicorn
worker on `0.0.0.0:$PORT` as a non-root user.

Render supplies an `https://<service>.onrender.com` address and HTTPS certificate;
a purchased domain is not required. After the service address is known, configure
these values in Render's backend environment, never in React or committed files:

| Variables | Configuration |
|---|---|
| `DATABASE_URL` | Existing Neon's pooled PostgreSQL URL, including TLS parameters. No new Render database is needed. |
| `SECRET_KEY` | Existing strong JWT signing secret, at least 32 characters. |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | OpenAI credential and `gpt-6-luna`. |
| `FRONTEND_URL` | Optional override; defaults to Render's `RENDER_EXTERNAL_URL`. Use an exact HTTPS origin without a path. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | TalentMatch's Google OAuth client credentials. |
| `GOOGLE_REDIRECT_URI`, `GOOGLE_COOKIE_SAMESITE` | Callback defaults to `${RENDER_EXTERNAL_URL}/auth/google/callback/`; override only if needed. Keep the cookie setting `lax`. |
| `MAIL_PROVIDER`, `MAIL_FROM`, `MAIL_FROM_NAME` | Use `gmail_api` and the mailbox that authorized sending. The optional display name defaults to `TalentMatch`. |
| `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` | Private credentials for the owner's mail client. Public Google sign-in uses the separate `GOOGLE_CLIENT_*` variables. |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_STORAGE_BUCKET_NAME`, `AWS_REGION` | Existing S3 configuration for avatar uploads; the current region is `ca-central-1`. |

Add the exact deployed callback, including its trailing slash, to the Google
Cloud client's authorized redirect URIs. Keep the localhost callback for local
development. The shared frontend/API origin allows Google signup and account
linking to use first-party cookies. Set the Google OAuth audience/publishing
status appropriately before inviting users.

Render provides `RENDER_EXTERNAL_URL` automatically. Leave `FRONTEND_URL` and
`GOOGLE_REDIRECT_URI` unset for this single-service deployment: CORS, Google popup
messages, the OAuth callback, and password-reset email links then use the public
Render address. Explicit overrides take priority; do not copy localhost values
from the development `.env` into Render. Outside Render, local defaults remain
frontend port 3000 and backend callback port 8000.

The Docker image supplies `FRONTEND_DIST_DIR=/app/frontend/build` and disables
frontend source-map generation. Leave `REACT_APP_API_URL` unset for this topology;
local development still defaults to `http://localhost:8000`. `.dockerignore`
excludes developer `.env` files, local dependencies, and build artifacts.
The app does not migrate or initialize the database at startup: verify the
existing Neon schema before deployment; use a direct Neon connection for any
separately reviewed migration.

Use `/healthz` as Render's health-check path. It does not call OpenAI or wake
Neon. Supported React deep links serve the SPA; API errors remain API errors.
HTML is revalidated, hashed static assets use immutable caching, and responses
are gzip-compressed. Page routes load on demand. In the November 2026 build,
initial JavaScript decreased from 113.70 to 95.78 KB gzip, initial CSS from 18.12
to 11.77 KB gzip, and the favicon request from 1.4 MB to a 322-byte SVG. Profile
suggestions reuse a bounded 15-minute cache and share identical in-flight calls.

Matching requires a signed-in user. Limits are a 5 MB resume, 40,000 extracted
resume characters, and 30,000 job-description characters. Defaults are 10 matching
attempts per user per hour, 100 across the service per hour, and two concurrent matches;
configure these through `MATCHES_PER_USER_HOUR`, `MATCHES_PER_HOUR`, and
`MATCH_CONCURRENCY`. These controls and caches are **process-local**, reset on
restart, and are **not a persistent billing cap**. Use shared enforcement before
scaling to multiple workers or instances.

Render Free sleeps after 15 idle minutes, and a later request can take about a
minute to wake it. Its filesystem is ephemeral; persistent application data stays
in Neon and uploaded avatars stay in S3. Render Free blocks common SMTP ports,
so password-reset and verification emails use HTTPS. Enable the Gmail API in a
dedicated Google Cloud project and authorize the owner's mailbox with the
`gmail.send` scope. For a dedicated personal mailbox, Google's Personal OAuth
mode restricts consent to its owner. Users signing into TalentMatch are only
asked for identity and email. [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes) · [Google OAuth audiences](https://support.google.com/cloud/answer/15549945)

From `backend/`, use the desktop client JSON from that project to connect
the sender once. The helper opens a local callback and writes a new ignored
file after consent. Import its values into the Render service's private
environment.

```powershell
python -m app.commands.authorize_gmail_sender --client-json "PATH_TO_DESKTOP_CLIENT.json" --sender-email "YOUR_SENDER@gmail.com" --output ".env.gmail-sender" --manual-browser
```

The optional SMTP2GO adapter accepts `MAIL_PROVIDER=smtp2go`, a verified
`MAIL_FROM` and a private `SMTP2GO_API_KEY`. Free hosting is
subject to plan limits; OpenAI and S3 remain separately metered, and email has its
own allowance. This deployment path does not restart, modify, or delete Railway
services. See [Render Free limits](https://render.com/docs/free),
[Render HTTPS](https://render.com/docs/tls), and [Neon limits](https://neon.com/pricing).

Validation before deploying:

```powershell
# From backend: mocked external services and isolated fixtures
python -B -m unittest discover -s tests -p "test_*.py"
# From frontend
npm test -- --watchAll=false --runInBand
npm run build
# From repository root, when Docker is available
docker build -t talentmatch .
```

PostgreSQL concurrency tests run only when explicitly given a disposable branch
through `TALENTMATCH_TEST_DATABASE_URL` and `TALENTMATCH_POSTGRES_TEST_HOST`; leave
these unset for ordinary checks. After Render reports the deploy live, verify
`/healthz`, `/login`, a direct `/contact` visit, Google sign-in, email delivery,
and one authenticated match. A successful build alone does not verify those flows.

### 5. Troubleshooting
#### CORS error?
Ensure the backend allows http://localhost:3000 in CORSMiddleware settings.

#### OpenAI key not found?
Double-check your .env file and restart the backend after updating it.

#### PDF extraction fails?
Use a non-password-protected, standard PDF.

#### Dependency errors?
Upgrade pip: pip install --upgrade pip and try again.

### 6. Security
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

### 7. Database

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

### 8. License
Apache License.
Feel free to use, fork, or contribute!
