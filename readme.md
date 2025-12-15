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

- Python 3.9+
- Node.js (v16+ recommended)
- npm (comes with Node.js)
- [OpenAI API Key](https://platform.openai.com/)
- (Production) PostgreSQL database (e.g. Railway)
---

## Setup Instructions

### 1. Clone the Repository
git clone https://github.com/NguyenDal/Resume-Matcher.git
cd Resume-Matcher

### 2. Backend Setup (FastAPI)
#### Create and activate a virtual environment
python -m venv venv
##### Windows:
venv\Scripts\activate
##### MacOS/Linux:
source venv/bin/activate

#### Install Python dependencies

pip install -r requirements.txt

If you don’t have a requirements.txt, use:

pip install fastapi[all] uvicorn[standard] python-dotenv openai PyPDF2 python-docx SQLAlchemy psycopg2-binary python-multipart passlib[bcrypt] python-jose[cryptography] PyJWT fastapi-mail email-validator boto3 spacy transformers torch

#### Configure environment variables
Create a .env file in your backend directory with:

OPENAI_API_KEY=your_openai_api_key_here

#### Start the FastAPI server

##### If main.py is at root

py -m uvicorn main:app --reload

##### If main.py is inside an 'app' folder:

py -m uvicorn app.main:app --reload
The server runs at: http://localhost:8000

### 3. Frontend Setup (React)
- cd frontend
- npm install
- npm start
- The frontend runs at: http://localhost:3000

- Open http://localhost:3000 in your browser.

- Upload your resume and paste the job description.

- Click Check Match.

- Review your match score, see detailed requirement breakdown, and use the fit Q&A for preparation.

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

#### a. How is user data stored?

- TalentMatch uses a PostgreSQL database by default for production and deployment.
    Your user account info (email, username, password hash, etc.) is securely stored in PostgreSQL, which runs in the Railway cloud.

- For local development, you can still use a lightweight SQLite database (app.db) if you haven’t configured PostgreSQL.
    This makes it easy to get started without setting up anything extra.

- Passwords are always stored securely using strong hashing.
    Your real password is never saved.

#### b. How to create (or reset) the database

##### For PostgreSQL (Production/Cloud e.g. Railway):

- Make sure your .env and app/database.py are configured for your PostgreSQL connection.

- Run the table creation script in your backend folder to initialize your tables in the Postgres DB:
    py -m app.init_db

- You can also double check your tables by running:
    py -m app.check_tables

- You can use the Railway dashboard (or your preferred SQL client) to inspect your tables and data.

- Sometimes you want to inspect the DB directly (see data, run SQL, etc.).
  On Railway, open your Postgres service and go to:
  Connect -> Public Network

  You’ll see something like:

    Host: gondola.proxy.rlwy.net
    Port: 33443
    Database: railway
    User: postgres
    Password: (shown as PGPASSWORD or inside the connection URL)

Open SQL Shell (psql) to type in the details. If everything is correct, you’ll be connected and see:
railway=#

##### For SQLite (Local Development):

If you want to generate a fresh app.db (for testing/development):

- Make sure your backend environment is activated.

- Run: 
    py -m app.init_db -> py -m app.check_tables

- After running this, you’ll see app.db created in your backend folder, ready for local development.

#### c. What happens in production or on a real server?

- In production, your database is stored in the cloud (on Railway’s PostgreSQL or another managed service).

- Data is persisted in the PostgreSQL database; you can manage and back it up using Railway’s tools or a standard SQL client.

- For scaling, team collaboration, or cloud deployments, PostgreSQL is the recommended choice.

- If you move your app or need to migrate data, use standard PostgreSQL tools (pg_dump, pg_restore, etc.).

#### d. Switching databases

- You can switch between SQLite and PostgreSQL by updating the database connection string in app/database.py and your .env file.

- SQLite is recommended for fast prototyping/local dev; PostgreSQL is required for production and deployment.

### 7. License
Apache License.
Feel free to use, fork, or contribute!