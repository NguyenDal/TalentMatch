import React, { useEffect, useState } from "react";
import axios from "axios";
import { BASE_URL } from "./api";
import { useAuth } from "./AuthContext";

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

  const fieldClass = "w-full rounded-md border border-gray-300 dark:border-gray-700 px-4 py-2 focus:ring-2 focus:ring-purple-300 dark:focus:ring-purple-500 bg-white dark:bg-gray-800 text-black dark:text-gray-100";
  const labelClass = "block text-gray-700 dark:text-gray-200 font-medium mb-1";
  return <section className="mb-10" aria-labelledby="password-settings-title">
    <h3 id="password-settings-title" className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
      {hasPassword === false ? "Set a password" : "Change password"}
    </h3>
    {error && <p role="alert" className="mb-4 text-sm text-red-700 dark:text-red-300">{error}</p>}
    {message && <p role="status" className="mb-4 text-sm text-green-700 dark:text-green-300">{message}</p>}
    {hasPassword === null ? error
      ? <button type="button" onClick={() => setReload(reload + 1)} className="underline">Try again</button>
      : <p role="status" className="text-sm text-gray-500 dark:text-gray-400">Loading password settings…</p>
      : <>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{hasPassword
          ? "Update your password to keep your account secure."
          : "You signed up with Google. Add a password if you’d also like to sign in with your email or username."}</p>
        <form className="space-y-4" onSubmit={submit} aria-busy={busy}>
          {hasPassword && <div>
            <label htmlFor="settings-current-password" className={labelClass}>Current password</label>
            <input id="settings-current-password" type="password" autoComplete="current-password" required
              value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} disabled={busy} className={fieldClass} />
          </div>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="settings-new-password" className={labelClass}>New password</label>
              <input id="settings-new-password" type="password" autoComplete="new-password" required minLength={8}
                value={newPassword} onChange={(event) => setNewPassword(event.target.value)} disabled={busy} className={fieldClass} />
            </div>
            <div>
              <label htmlFor="settings-confirm-password" className={labelClass}>Confirm new password</label>
              <input id="settings-confirm-password" type="password" autoComplete="new-password" required minLength={8}
                value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} disabled={busy} className={fieldClass} />
            </div>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">Use at least 8 characters.</p>
          <div className="flex justify-end"><button type="submit" disabled={busy}
            className="bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white px-6 py-2 rounded-md font-semibold transition">
            {busy ? "Saving…" : hasPassword ? "Update password" : "Set password"}
          </button></div>
        </form>
      </>}
  </section>;
}
