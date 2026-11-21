"""Local operator-only Gmail send authorization; never imported by the web app.

Run from backend with ``python -m app.commands.authorize_gmail_sender --help``.
The downloaded client must be a separate Desktop app client, not the site's
Google sign-in client. No mailbox is read and this helper sends no email.
"""

import argparse
import base64
import csv
import hashlib
import io
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener
import webbrowser


AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send"
CALLBACK_PATH = "/oauth/callback"
REPO_ROOT = Path(__file__).resolve().parents[3]
MAX_RESPONSE_BYTES = 64 * 1024
TOKEN_VALUE = re.compile(r"[A-Za-z0-9._~+/=\-]+\Z")


class AuthorizationError(Exception):
    """Only fixed, credential-free messages are exposed to the operator."""


def load_desktop_client(path):
    try:
        with Path(path).open("rb") as stream:
            content = stream.read(MAX_RESPONSE_BYTES + 1)
        if len(content) > MAX_RESPONSE_BYTES:
            raise ValueError
        config = json.loads(content)
        client = config.get("installed")
        if not isinstance(client, dict) or "web" in config:
            raise ValueError
        client_id, client_secret = client.get("client_id"), client.get("client_secret")
        if not valid_token_value(client_id) or not client_id.endswith(".apps.googleusercontent.com"):
            raise ValueError
        if not valid_token_value(client_secret):
            raise ValueError
        if client.get("auth_uri") not in {AUTH_URL, "https://accounts.google.com/o/oauth2/auth"}:
            raise ValueError
        if client.get("token_uri") != TOKEN_URL:
            raise ValueError
        return {"client_id": client_id, "client_secret": client_secret}
    except (OSError, ValueError, TypeError, AttributeError):
        raise AuthorizationError("Could not load a valid Google Desktop app client JSON. Download a separate Desktop client from Google Cloud.") from None


def valid_token_value(value):
    return isinstance(value, str) and 0 < len(value) <= 8192 and TOKEN_VALUE.fullmatch(value) is not None


def validate_sender(value):
    # Sender identity is selected by the operator. Verifying it through a user
    # profile endpoint would need an additional scope, which we never request.
    if not re.fullmatch(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,63}", value):
        raise AuthorizationError("Enter a plain Gmail or Google Workspace email address for --sender-email.")
    return value


def validate_output(path, repo_root=REPO_ROOT):
    output = Path(path).expanduser().resolve()
    root = Path(repo_root).resolve()
    if not output.is_relative_to(root) or not output.name.startswith(".env.") or output.name == ".env.example":
        raise AuthorizationError("Choose a new .env.* output file inside this repository, such as backend/.env.gmail-sender.")
    if output.exists() or not output.parent.is_dir():
        raise AuthorizationError("The output must not exist and its parent directory must already exist. Nothing was overwritten.")
    try:
        ignored = subprocess.run(["git", "check-ignore", "--quiet", "--", str(output)], cwd=root,
                                 capture_output=True, timeout=10, check=False)
        if ignored.returncode != 0:
            raise AuthorizationError("The selected output is not Git-ignored. Choose a new ignored .env.* file.")
    except (OSError, subprocess.SubprocessError):
        raise AuthorizationError("Could not verify that the output file is Git-ignored. Check that Git is available.") from None
    return output


def new_authorization(client_id, redirect_uri, sender):
    verifier = secrets.token_urlsafe(64)
    state = secrets.token_urlsafe(32)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode("ascii")).digest()).rstrip(b"=").decode("ascii")
    query = urlencode({
        "client_id": client_id, "redirect_uri": redirect_uri, "response_type": "code",
        "scope": SEND_SCOPE, "access_type": "offline", "prompt": "consent",
        "state": state, "code_challenge": challenge, "code_challenge_method": "S256",
        "login_hint": sender,
    })
    return AUTH_URL + "?" + query, verifier, state


def parse_callback(path, host, peer, expected_host, state):
    """Validate only the exact local callback; return its code without logging."""
    if peer != "127.0.0.1" or host != expected_host or len(path) > 8192:
        raise AuthorizationError("Rejected a callback that did not match the local authorization listener.")
    target = urlsplit(path)
    if target.scheme or target.netloc or target.fragment or target.path != CALLBACK_PATH:
        raise AuthorizationError("Rejected an unexpected callback address.")
    try:
        fields = parse_qs(target.query, keep_blank_values=True, max_num_fields=12)
    except ValueError:
        raise AuthorizationError("Rejected an invalid authorization callback.") from None
    returned_state = fields.get("state", [])
    if len(returned_state) != 1 or not valid_token_value(returned_state[0]) or not secrets.compare_digest(returned_state[0], state):
        raise AuthorizationError("Authorization state did not match. Restart this helper and use its newly opened browser window.")
    if "error" in fields:
        raise AuthorizationError("Google authorization was not granted. No credential file was written.")
    code = fields.get("code", [])
    if len(code) != 1 or not valid_token_value(code[0]):
        raise AuthorizationError("Google did not return a valid authorization code. Restart this helper.")
    if "scope" in fields and (len(fields["scope"]) != 1 or set(fields["scope"][0].split()) != {SEND_SCOPE}):
        raise AuthorizationError("Google returned a scope other than Gmail send-only. No credential file was written.")
    return code[0]


class CallbackHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Default HTTP logs include the authorization code in the URL.
        pass

    def do_GET(self):
        if self.path == "/start":
            if self.client_address[0] != "127.0.0.1" or self.headers.get("Host") != self.server.expected_host:
                self.respond(400, "Use the local browser address printed by the helper.")
                return
            self.send_response(302)
            self.send_header("Location", self.server.authorization_url)
            self.send_header("Content-Length", "0")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Referrer-Policy", "no-referrer")
            self.end_headers()
            return
        if urlsplit(self.path).path != CALLBACK_PATH:
            self.respond(404, "This local listener only accepts the Google authorization callback.")
            return
        try:
            code = parse_callback(self.path, self.headers.get("Host"), self.client_address[0],
                                  self.server.expected_host, self.server.state)
        except AuthorizationError as error:
            self.server.authorization_error = error
            self.server.done = True
            self.respond(400, "Authorization was not completed. Return to the terminal for the next step.")
            return
        self.server.authorization_code = code
        self.server.done = True
        self.respond(200, "Authorization received. You may close this tab and return to the terminal.")

    def respond(self, status, message):
        content = message.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
        self.end_headers()
        self.wfile.write(content)


class CallbackServer(HTTPServer):
    def get_request(self):
        connection, address = super().get_request()
        connection.settimeout(5)
        return connection, address

    def handle_error(self, request, client_address):
        # Never let the standard server traceback expose a callback URL.
        self.authorization_error = AuthorizationError("The local callback could not complete. Restart the helper.")
        self.done = True


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, new_url):
        return None


def validate_grant(result):
    if not isinstance(result, dict) or not isinstance(result.get("token_type"), str) or result["token_type"].lower() != "bearer":
        raise AuthorizationError("Google returned an invalid token response. No credential file was written.")
    scope = result.get("scope")
    if not isinstance(scope, str) or set(scope.split()) != {SEND_SCOPE}:
        raise AuthorizationError("The granted permission was not exactly Gmail send-only. No credential file was written.")
    if not valid_token_value(result.get("access_token")):
        raise AuthorizationError("Google did not return a usable access token. No credential file was written.")
    if type(result.get("expires_in")) is not int or result["expires_in"] <= 0:
        raise AuthorizationError("Google did not return a usable token lifetime. No credential file was written.")
    refresh_token = result.get("refresh_token")
    if not valid_token_value(refresh_token):
        raise AuthorizationError("Google did not return a refresh token for offline access. Restart the consent flow with the separate Desktop client.")
    if "refresh_token_expires_in" in result:
        raise AuthorizationError("Google returned a time-limited refresh grant. Use a Personal, production, or internal consent configuration and authorize again before deploying.")
    return refresh_token


def exchange_code(client, code, verifier, redirect_uri):
    form = urlencode({**client, "code": code, "code_verifier": verifier,
                      "redirect_uri": redirect_uri, "grant_type": "authorization_code"}).encode("ascii")
    request = Request(TOKEN_URL, data=form, method="POST", headers={
        "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"})
    try:
        # Fixed HTTPS endpoint, certificate verification, no redirects or retries.
        opener = build_opener(ProxyHandler({}), NoRedirect())
        with opener.open(request, timeout=30) as response:
            content = response.read(MAX_RESPONSE_BYTES + 1)
        if len(content) > MAX_RESPONSE_BYTES:
            raise ValueError
        result = json.loads(content)
    except (HTTPError, URLError, OSError, ValueError, TypeError):
        raise AuthorizationError("Google could not exchange the authorization code. Check the Desktop client and network, then restart. No credential file was written.") from None
    return validate_grant(result)


def restrict_windows_file(path):
    """Remove inherited ACLs before writing any credential bytes on Windows."""
    try:
        identity = subprocess.run(["whoami", "/user", "/fo", "csv", "/nh"],
                                  capture_output=True, text=True, timeout=10, check=True)
        sid = next(csv.reader(io.StringIO(identity.stdout)))[1]
        if not re.fullmatch(r"S-1-[0-9-]+", sid):
            raise ValueError
        subprocess.run(["icacls", str(path), "/inheritance:r", "/grant:r", f"*{sid}:(F)"],
                       capture_output=True, timeout=10, check=True)
    except (OSError, ValueError, IndexError, StopIteration, subprocess.SubprocessError):
        raise AuthorizationError("Could not restrict the output file to your Windows account. No credentials were saved.") from None


def write_env(output, client, refresh_token, sender):
    values = {"MAIL_PROVIDER": "gmail_api", "GMAIL_CLIENT_ID": client["client_id"],
              "GMAIL_CLIENT_SECRET": client["client_secret"], "GMAIL_REFRESH_TOKEN": refresh_token,
              "MAIL_FROM": sender, "MAIL_FROM_NAME": "TalentMatch"}
    content = "# Private Gmail send-only grant. Do not commit or share this file.\n" + "".join(f"{key}={value}\n" for key, value in values.items())
    created = False
    try:
        descriptor = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        created = True
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as stream:
            if os.name == "nt":
                restrict_windows_file(output)
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
    except (OSError, AuthorizationError, KeyboardInterrupt):
        if created:
            try:
                Path(output).unlink(missing_ok=True)
            except OSError:
                pass
        raise AuthorizationError("Could not save the private credential file. Nothing was overwritten; select a new ignored output file and try again.") from None


def authorize(client_path, output_path, sender, consent_status=None, timeout=300, manual_browser=False):
    if consent_status not in {None, "personal", "production", "internal"}:
        raise AuthorizationError("Use a Personal, production, or internal consent configuration before requesting a deployment grant. Google Testing grants expire after 7 days.")
    sender = validate_sender(sender)
    output = validate_output(output_path)
    client = load_desktop_client(client_path)
    with CallbackServer(("127.0.0.1", 0), CallbackHandler) as server:
        server.timeout = 1
        server.expected_host = f"127.0.0.1:{server.server_port}"
        redirect_uri = f"http://{server.expected_host}{CALLBACK_PATH}"
        server.authorization_url, verifier, server.state = new_authorization(client["client_id"], redirect_uri, sender)
        server.done, server.authorization_code, server.authorization_error = False, None, None
        start_url = f"http://{server.expected_host}/start"
        if manual_browser:
            print(f"Open this local address in your browser: {start_url}", flush=True)
        else:
            print("Opening Google consent in your browser.", flush=True)
            if not webbrowser.open(start_url, new=1, autoraise=True):
                raise AuthorizationError("Could not open the system browser. Restart with --manual-browser to open the local address yourself.")
        print("Choose the account matching --sender-email and allow send-only access.", flush=True)
        print("This helper does not read your inbox or send a message. Waiting for the local callback...", flush=True)
        deadline = time.monotonic() + timeout
        while not server.done and time.monotonic() < deadline:
            server.handle_request()
        if not server.done:
            raise AuthorizationError("Authorization timed out. No credential file was written; restart when ready.")
        if server.authorization_error:
            raise server.authorization_error
        refresh_token = exchange_code(client, server.authorization_code, verifier, redirect_uri)
    write_env(output, client, refresh_token, sender)
    print(f"Send-only authorization saved to the new private file: {output}", flush=True)
    print("Use its fields as private Render environment variables. No credentials were printed and no email was sent.", flush=True)
    return output


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--client-json", required=True, help="Downloaded Google Desktop client JSON; never the website sign-in client.")
    parser.add_argument("--output", required=True, help="New Git-ignored .env.* file inside this repository.")
    parser.add_argument("--sender-email", required=True, help="Exact Gmail/Workspace account you will select in Google consent.")
    parser.add_argument("--consent-status", choices=("personal", "production", "internal"), help="Optional consent configuration label. Testing apps do not provide a deployment-length grant.")
    parser.add_argument("--manual-browser", action="store_true", help="Print only a local /start address to open in your preferred browser.")
    args = parser.parse_args(argv)
    try:
        authorize(args.client_json, args.output, args.sender_email, args.consent_status, manual_browser=args.manual_browser)
        return 0
    except AuthorizationError as error:
        print(str(error), file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("Authorization canceled. Check the selected output path before restarting.", file=sys.stderr)
        return 1
    except Exception:
        # Network/library exceptions may contain request URLs or credentials.
        print("Authorization could not complete. No credential details were logged. Check the local setup and restart.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
