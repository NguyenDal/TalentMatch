import React, { useEffect, useState } from "react";
import axios from "axios";
import { BASE_URL } from "../../services/api";
import { useAuth } from "../../contexts/AuthContext";

export default function AccountPasswordForm() {
  const { user } = useAuth();
  const [hasPassword, setHasPassword] = useState(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setHasPassword(null);
    setError("");
    axios.get(`${BASE_URL}/me/`, { headers: { Authorization: `Bearer ${user?.token}` }, signal: controller.signal })
      .then(({ data }) => {
        if (controller.signal.aborted) return;
        if (typeof data.has_password !== "boolean") throw new Error("Unable to load password settings.");
        setHasPassword(data.has_password);
      })
      .catch(() => { if (!controller.signal.aborted) setError("Unable to load password settings. Please try again."); });
    return () => controller.abort();
  }, [user?.token, reload]);

  const submit = async (event) => {
    event.preventDefault();
    if (busy || hasPassword === null) return;
    setError("");
    setMessage("");
    if (newPassword !== confirmPassword) { setError("New password and confirmation do not match."); return; }
    setBusy(true);
    try {
      const form = new FormData();
      if (hasPassword) form.append("current_password", currentPassword);
      form.append("new_password", newPassword);
      const { data } = await axios.post(`${BASE_URL}/account/${hasPassword ? "change-password" : "set-password"}/`, form,
        { headers: { Authorization: `Bearer ${user?.token}` } });
      setMessage(data.message || (hasPassword ? "Password updated successfully." : "Password added. You can now sign in with Google or your password."));
      setHasPassword(true);
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Unable to save your password. Please try again.");
    } finally { setBusy(false); }
  };

  return <section className="tm-settings-password" aria-labelledby="password-settings-title">
    <h3 id="password-settings-title">
      {hasPassword === false ? "Set a password" : "Change password"}
    </h3>
    {error && <p role="alert" className="tm-settings-notice tm-settings-notice--error">{error}</p>}
    {message && <p role="status" className="tm-settings-notice tm-settings-notice--success">{message}</p>}
    {hasPassword === null ? error
      ? <button type="button" onClick={() => setReload(reload + 1)} className="tm-settings-button tm-settings-button--secondary">Try again</button>
      : <p role="status" className="tm-settings-loading">Loading password settings…</p>
      : <>
        {!hasPassword && <p className="tm-settings-password-intro">You signed up with Google. Adding a password also lets you sign in with your email or username.</p>}
        <form className="tm-settings-password-form" onSubmit={submit} aria-busy={busy}>
          {hasPassword && <div className="tm-settings-password-current">
            <label htmlFor="settings-current-password">Current password</label>
            <input id="settings-current-password" type="password" autoComplete="current-password" required
              value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} disabled={busy} />
          </div>}
          <div className="tm-settings-password-fields">
            <div>
              <label htmlFor="settings-new-password">New password</label>
              <input id="settings-new-password" type="password" autoComplete="new-password" required minLength={8}
                value={newPassword} onChange={(event) => setNewPassword(event.target.value)} disabled={busy} aria-describedby="settings-password-hint" />
            </div>
            <div>
              <label htmlFor="settings-confirm-password">Confirm new password</label>
              <input id="settings-confirm-password" type="password" autoComplete="new-password" required minLength={8}
                value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} disabled={busy} />
            </div>
          </div>
          <div className="tm-settings-form-footer"><span id="settings-password-hint">Use at least 8 characters.</span><button type="submit" disabled={busy}
            className="tm-settings-button tm-settings-button--primary">
            {busy ? "Saving…" : hasPassword ? "Update password" : "Set password"}
          </button></div>
        </form>
      </>}
  </section>;
}
