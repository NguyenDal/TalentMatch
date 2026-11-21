import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { FiArrowRight, FiLock } from "react-icons/fi";
import { BASE_URL } from "../../services/api";
import { useAuth } from "../../contexts/AuthContext";
import AuthField, { AuthError } from "./AuthField";
import UsernameField from "./UsernameField";
import useUsernameAvailability from "../../hooks/useUsernameAvailability";
import { getAuthPopupFeatures } from "../../utils/authPopupPosition";
import "./GoogleAuth.css";

const credentials = { withCredentials: true };

function GoogleMark() {
  return <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.89-1.74 2.98-4.31 2.98-7.36Z" />
    <path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.04.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.06v2.6A10 10 0 0 0 12 22Z" />
    <path fill="#FBBC05" d="M6.41 13.92a6 6 0 0 1 0-3.84v-2.6H3.06a10 10 0 0 0 0 9.04l3.35-2.6Z" />
    <path fill="#EA4335" d="M12 5.96c1.47 0 2.79.5 3.82 1.5l2.87-2.87A9.63 9.63 0 0 0 12 2a10 10 0 0 0-8.94 5.48l3.35 2.6C7.2 7.72 9.4 5.96 12 5.96Z" />
  </svg>;
}

function GoogleAccountDialog({ pending, onCancel, onComplete, returnFocus }) {
  const dialog = useRef(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const availability = useUsernameAvailability(username);
  const signup = pending.status === "signup_required";
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const previousFocus = document.activeElement;
    const focusTarget = returnFocus.current || previousFocus;
    const element = dialog.current;
    element.showModal();
    element.querySelector(signup ? "input" : "[data-cancel]")?.focus();
    return () => {
      mounted.current = false;
      element.close();
      if (focusTarget?.isConnected) focusTarget.focus();
    };
  }, [signup, returnFocus]);

  const submit = async (event) => {
    event.preventDefault();
    if (busy || (signup && !availability.available)) return;
    setBusy(true);
    setError("");
    try {
      const body = signup ? { ticket: pending.ticket, username } : {
        ticket: pending.ticket, confirm: true,
        ...(pending.requires_password ? { password } : {}),
      };
      const { data } = await axios.post(`${BASE_URL}/auth/google/${signup ? "signup" : "link"}/`, body, credentials);
      if (mounted.current) onComplete(data, data.remember === true);
    } catch (err) {
      if (mounted.current) setError(err.response?.data?.detail || "We couldn’t complete Google sign-in. Please try again.");
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const trapFocus = (event) => {
    if (event.key !== "Tab") return;
    const elements = Array.from(dialog.current.querySelectorAll("button:not(:disabled), input:not(:disabled), [tabindex='0']"));
    const first = elements[0];
    const last = elements[elements.length - 1];
    if (!first) { event.preventDefault(); return; }
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  return <dialog ref={dialog} className="tm-google-dialog" aria-labelledby="google-dialog-title"
    aria-describedby="google-dialog-description" onKeyDown={trapFocus}
    onCancel={(event) => { event.preventDefault(); if (!busy) onCancel(); }}>
    <div className="tm-google-dialog-mark"><GoogleMark /></div>
    <h2 id="google-dialog-title">{signup ? "Choose your username." : "Link your account to Google?"}</h2>
    <p id="google-dialog-description">{signup
      ? <>You’re signing up with <strong>{pending.email}</strong>. Pick a unique username to make it yours.</>
      : <>An account already uses <strong>{pending.email}</strong>. {pending.replaces_unverified_password
        ? "Link it to Google to securely sign in."
        : "Link it to Google so you can use either way to sign in."}</>}</p>
    <form className="tm-auth-form" onSubmit={submit} aria-busy={busy}>
      {signup && <UsernameField id="google-username" value={username}
        onChange={(event) => setUsername(event.target.value)} availability={availability} disabled={busy} />}
      {!signup && pending.requires_password && <>
        <p className="tm-google-help">Confirm your existing password to securely link this account.</p>
        <AuthField id="google-link-password" label="Current password" type="password" icon={FiLock}
          autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy} required />
      </>}
      {!signup && pending.replaces_unverified_password && <p className="tm-google-help">
        This account’s email hasn’t been verified yet. Linking Google will replace its existing password to keep your account secure. You can set a new password in Settings afterward.
      </p>}
      {signup && <p className="tm-google-help">No password needed. You can add one later in Settings.</p>}
      <AuthError error={error} id="google-dialog-error" />
      <div className="tm-google-dialog-actions">
        <button type="button" className="tm-google-cancel" data-cancel onClick={onCancel} disabled={busy}>Not now</button>
        <button className="tm-auth-submit" type="submit" disabled={busy || (signup && !availability.available)}>
          {busy ? "Signing in…" : signup ? "Create account" : "Link & sign in"}
          {!busy && <FiArrowRight aria-hidden="true" />}
        </button>
      </div>
    </form>
  </dialog>;
}

export default function GoogleAuth({ remember = false, disabled = false }) {
  const { setAuthData } = useAuth();
  const [enabled, setEnabled] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(null);
  const stopPopup = useRef(null);
  const button = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    axios.get(`${BASE_URL}/auth/google/config/`, { signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setEnabled(data.enabled === true); })
      .catch(() => { if (!controller.signal.aborted) setEnabled(false); });
    return () => { controller.abort(); stopPopup.current?.(); };
  }, []);

  const complete = (auth, shouldRemember) => {
    if (!auth || typeof auth.access_token !== "string" || typeof auth.email !== "string" || typeof auth.username !== "string") {
      throw new Error("Google sign-in returned an invalid response. Please try again.");
    }
    setAuthData({ token: auth.access_token, email: auth.email, username: auth.username }, shouldRemember);
    setPending(null);
  };

  const start = () => {
    if (busy || disabled || !enabled) return;
    setError("");
    const popup = window.open(`${BASE_URL}/auth/google/start/?remember=${remember ? "true" : "false"}`,
      "talentmatch-google-auth", getAuthPopupFeatures(button.current));
    if (!popup) { setError("Your browser blocked the sign-in window. Allow pop-ups and try again."); return; }
    setBusy(true);
    const expectedOrigin = new URL(BASE_URL, window.location.origin).origin;
    let checkClosed;
    let timeout;
    let finished = false;
    const clean = () => {
      finished = true;
      window.removeEventListener("message", receive);
      clearInterval(checkClosed);
      clearTimeout(timeout);
      popup.close();
      stopPopup.current = null;
    };
    const receive = (event) => {
      if (finished || event.source !== popup || event.origin !== expectedOrigin || event.data?.type !== "talentmatch:google-auth") return;
      const data = event.data;
      if (!["success", "signup_required", "link_required", "error"].includes(data.status)) return;
      clean();
      setBusy(false);
      button.current?.focus();
      if (data.status === "success") {
        try { complete(data.auth, data.remember === true); } catch (err) { setError(err.message); }
      } else if ((data.status === "signup_required" || data.status === "link_required") &&
        typeof data.ticket === "string" && typeof data.email === "string") {
        setPending(data);
      } else {
        setError(typeof data.message === "string" ? data.message : "Google sign-in didn’t finish. Please try again.");
      }
    };
    window.addEventListener("message", receive);
    checkClosed = setInterval(() => {
      if (popup.closed) {
        clean();
        setBusy(false);
        setError("Google sign-in was closed. You can try again whenever you’re ready.");
        button.current?.focus();
      }
    }, 500);
    timeout = setTimeout(() => {
      clean(); setBusy(false); setError("Google sign-in timed out. Please try again."); button.current?.focus();
    }, 10 * 60 * 1000);
    stopPopup.current = clean;
    popup.focus?.();
  };

  const cancel = () => {
    if (pending) axios.post(`${BASE_URL}/auth/google/cancel/`, { ticket: pending.ticket }, credentials).catch(() => {});
    setPending(null);
  };

  return <div className="tm-google-auth">
    <button ref={button} className="tm-google-button" type="button" onClick={start}
      disabled={disabled || busy || !enabled} aria-busy={busy}>
      <GoogleMark /> {busy ? "Waiting for Google…" : "Continue with Google"}
    </button>
    {enabled === false && <p className="tm-google-help">Google sign-in is currently unavailable. You can use email below.</p>}
    <AuthError error={error} id="google-auth-error" />
    <div className="tm-auth-divider"><span>or continue with email</span></div>
    {pending && <GoogleAccountDialog pending={pending} onCancel={cancel} onComplete={complete} returnFocus={button} />}
  </div>;
}
