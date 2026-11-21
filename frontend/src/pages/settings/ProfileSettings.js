import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import {
  FiArrowLeft,
  FiArrowRight,
  FiBell,
  FiCheck,
  FiCheckCircle,
  FiChevronRight,
  FiLock,
  FiLogOut,
  FiMonitor,
  FiRefreshCw,
  FiSettings,
  FiShield,
  FiTrash2,
  FiUpload,
  FiUser,
} from "react-icons/fi";
import axios from "axios";
import { BASE_URL, getAuthHeaders } from "../../services/api";
import { useAuth } from "../../contexts/AuthContext";
import AccountPasswordForm from "./AccountPasswordForm";
import "./ProfileSettings.css";
const headersFor = user => user?.token ? {
  Authorization: `Bearer ${user.token}`
} : getAuthHeaders();
const errorMessage = (error, fallback) => typeof error?.response?.data?.detail === "string" ? error.response.data.detail : fallback;
function Notice({
  message,
  type = "success"
}) {
  return message ? <p
    className={`tm-settings-notice tm-settings-notice--${type}`}
    role={type === "error" ? "alert" : "status"}
  >
    {type === "success" && <FiCheckCircle aria-hidden="true" />}
    <span>{message}</span>
  </p> : null;
}
function SectionHeading({
  title,
  children
}) {
  return <div className="tm-settings-section-heading">
    <h2>{title}</h2>
    {children && <p>{children}</p>}
  </div>;
}
function ProfileDetails() {
  const {
    user
  } = useAuth();
  const fileInput = useRef(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reload, setReload] = useState(0);
  const [profile, setProfile] = useState({
    username: user?.username || "",
    email: "",
    profession: "",
    bio: ""
  });
  const [avatar, setAvatar] = useState("");
  const [imageFailed, setImageFailed] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState({});
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(false);
    axios.get(`${BASE_URL}/me/`, {
      headers: headersFor(user),
      signal: controller.signal
    }).then(({
      data
    }) => {
      if (controller.signal.aborted) return;
      setProfile({
        username: data.username || user?.username || "",
        email: data.email || "",
        profession: data.profession || "",
        bio: data.bio || ""
      });
      setAvatar(data.profile_image_url || "");
    }).catch(() => {
      if (!controller.signal.aborted) setLoadError(true);
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [user?.token, user?.username, reload]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setImageFailed(false);
  }, [avatar]);
  const updateField = name => event => setProfile(current => ({
    ...current,
    [name]: event.target.value
  }));
  const notify = (message, type = "success") => setNotice({
    message,
    type
  });
  const publishAvatar = url => window.dispatchEvent(new CustomEvent("talentmatch:profile-image-updated", {
    detail: {
      url
    }
  }));
  const uploadImage = async event => {
    const file = event.target.files?.[0];
    if (!file || imageBusy) return;
    setImageBusy(true);
    setNotice({});
    const preview = URL.createObjectURL(file);
    const previousAvatar = avatar;
    setAvatar(preview);
    try {
      const form = new FormData();
      form.append("image", file);
      const {
        data
      } = await axios.post(`${BASE_URL}/upload-profile-image/`, form, {
        headers: headersFor(user)
      });
      if (!data.profile_image_url) throw new Error("Missing image URL");
      setAvatar(data.profile_image_url);
      publishAvatar(data.profile_image_url);
      notify("Profile picture updated.");
    } catch (error) {
      setAvatar(previousAvatar);
      notify(errorMessage(error, "Your picture couldn’t be uploaded. Please try again."), "error");
    } finally {
      URL.revokeObjectURL(preview);
      setImageBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };
  const removeImage = async () => {
    setImageBusy(true);
    setNotice({});
    try {
      await axios.post(`${BASE_URL}/profile/clear-image/`, {}, {
        headers: headersFor(user)
      });
      setAvatar("");
      publishAvatar("");
      notify("Profile picture removed.");
    } catch (error) {
      notify(errorMessage(error, "Your picture couldn’t be removed. Please try again."), "error");
    } finally {
      setImageBusy(false);
    }
  };
  const saveProfile = async event => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setNotice({});
    try {
      const form = new FormData();
      ["email", "profession", "bio"].forEach(key => form.append(key, profile[key]));
      await axios.patch(`${BASE_URL}/profile/update/`, form, {
        headers: headersFor(user)
      });
      notify("Your profile has been saved.");
    } catch (error) {
      notify(errorMessage(error, "Your profile couldn’t be saved. Please try again."), "error");
    } finally {
      setSaving(false);
    }
  };
  const initials = (profile.username || "?").slice(0, 2).toUpperCase();
  return <>
    <SectionHeading title="Your profile" />
    {loading ? <p
      className="tm-settings-loading"
      role="status"
    >Loading your profile…</p> : loadError ? <div className="tm-settings-load-error">
      <Notice
        message="Your profile couldn’t be loaded. Please try again before making changes."
        type="error"
      />
      <button
        className="tm-settings-button tm-settings-button--secondary"
        onClick={() => setReload(reload + 1)}
      >
        <FiRefreshCw aria-hidden="true" />
        Try again
      </button>
    </div> : <>
      <Notice {...notice} />
      <section
        className="tm-settings-photo-section"
        aria-labelledby="profile-picture-title"
      >
        <div className="tm-settings-photo-identity">
          <div
            className="tm-settings-avatar"
            aria-busy={imageBusy}
          >
            {avatar && !imageFailed ? <img
              src={avatar}
              alt={`${profile.username || "Your"} profile`}
              onError={() => setImageFailed(true)}
            /> : <span aria-label={`${profile.username || "Your"} profile initials`}>{initials}</span>}
          </div>
          <div>
            <h3 id="profile-picture-title">Profile picture</h3>
            {profile.username && <p>
              @
              {profile.username}
            </p>}
            <p>JPG, PNG or WebP</p>
          </div>
        </div>
        <div className="tm-settings-photo-actions">
          <button
            type="button"
            className="tm-settings-button tm-settings-button--secondary"
            disabled={imageBusy}
            onClick={() => fileInput.current?.click()}
          >
            <FiUpload aria-hidden="true" />
            {imageBusy ? "Updating…" : "Change picture"}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="tm-settings-hidden"
            aria-label="Upload profile picture"
            onChange={uploadImage}
            disabled={imageBusy}
          />
          <button
            type="button"
            className="tm-settings-icon-button"
            aria-label="Remove profile picture"
            title="Remove profile picture"
            onClick={removeImage}
            disabled={!avatar || imageBusy}
          >
            <FiTrash2 aria-hidden="true" />
          </button>
        </div>
      </section>
      <form
        className="tm-settings-form"
        onSubmit={saveProfile}
        aria-busy={saving}
      >
        <div className="tm-settings-field-row">
          <div className="tm-settings-field-description">
            <label htmlFor="profile-email">Email address</label>
          </div>
          <input
            id="profile-email"
            type="email"
            autoComplete="email"
            required
            value={profile.email}
            onChange={updateField("email")}
            disabled={saving}
          />
        </div>
        <div className="tm-settings-field-row">
          <div className="tm-settings-field-description">
            <label htmlFor="profile-profession">Field of study</label>
          </div>
          <input
            id="profile-profession"
            type="text"
            placeholder="e.g. Computer science"
            value={profile.profession}
            onChange={updateField("profession")}
            disabled={saving}
          />
        </div>
        <div className="tm-settings-field-row">
          <div className="tm-settings-field-description">
            <label htmlFor="profile-bio">Preferred job titles</label>
          </div>
          <textarea
            id="profile-bio"
            rows={4}
            placeholder="e.g. Frontend developer, software engineer"
            value={profile.bio}
            onChange={updateField("bio")}
            disabled={saving}
          />
        </div>
        <div className="tm-settings-form-footer tm-settings-form-footer--end">
          <button
            className="tm-settings-button tm-settings-button--primary"
            type="submit"
            disabled={saving || imageBusy}
          >
            {saving ? "Saving…" : "Save changes"}
            <FiCheck aria-hidden="true" />
          </button>
        </div>
      </form>
    </>}
  </>;
}
function AccountSettings() {
  const {
    user,
    logout
  } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reload, setReload] = useState(0);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [savedEmail, setSavedEmail] = useState("");
  const [emailVerified, setEmailVerified] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [busy, setBusy] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [notice, setNotice] = useState({});
  const notify = (message, type = "success") => setNotice({
    message,
    type
  });
  useEffect(() => {
    if (!cooldown) return undefined;
    const id = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(false);
    axios.get(`${BASE_URL}/me/`, {
      headers: headersFor(user),
      signal: controller.signal
    }).then(({
      data
    }) => {
      if (controller.signal.aborted) return;
      setUsername(data.username || "");
      setEmail(data.email || "");
      setSavedEmail(data.email || "");
      setEmailVerified(!!data.email_verified);
    }).catch(() => {
      if (!controller.signal.aborted) setLoadError(true);
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [user?.token, reload]); // eslint-disable-line react-hooks/exhaustive-deps
  const saveAccount = async event => {
    event.preventDefault();
    if (busy) return;
    setBusy("save");
    setNotice({});
    try {
      const form = new FormData();
      form.append("username", username);
      form.append("email", email);
      const {
        data
      } = await axios.patch(`${BASE_URL}/account/update/`, form, {
        headers: headersFor(user)
      });
      setSavedEmail(email);
      if (typeof data.email_verified === "boolean") setEmailVerified(data.email_verified);
      notify(data.email_changed ? "Account updated. Send a verification code to confirm your new email." : "Account settings updated.");
    } catch (error) {
      notify(errorMessage(error, "Your account couldn’t be updated. Please try again."), "error");
    } finally {
      setBusy("");
    }
  };
  const sendCode = async () => {
    if (busy || cooldown || emailVerified) return;
    setBusy("send");
    setNotice({});
    try {
      await axios.post(`${BASE_URL}/account/send-verification/`, null, {
        headers: headersFor(user)
      });
      setCooldown(60);
      notify("Verification code sent. Check your inbox.");
    } catch (error) {
      notify(errorMessage(error, "The code couldn’t be sent. Please try again."), "error");
    } finally {
      setBusy("");
    }
  };
  const verifyEmail = async event => {
    event.preventDefault();
    if (busy) return;
    setBusy("verify");
    setNotice({});
    try {
      const params = new URLSearchParams();
      params.append("code", verificationCode.trim());
      const {
        data
      } = await axios.post(`${BASE_URL}/account/verify-email/`, params, {
        headers: headersFor(user)
      });
      if (!data.email_verified) throw new Error("Not verified");
      setEmailVerified(true);
      setVerificationCode("");
      notify("Email verified successfully.");
    } catch (error) {
      notify(errorMessage(error, "The code is invalid or has expired. Please try again."), "error");
    } finally {
      setBusy("");
    }
  };
  const deleteAccount = async () => {
    if (!window.confirm("Are you sure you want to delete your account? This action can't be undone.")) return;
    setBusy("delete");
    setNotice({});
    try {
      await axios.delete(`${BASE_URL}/account/delete/`, {
        headers: headersFor(user)
      });
      logout();
      navigate("/");
    } catch (error) {
      notify(errorMessage(error, "Your account couldn’t be deleted. Please try again."), "error");
    } finally {
      setBusy("");
    }
  };
  return <>
    <SectionHeading title="Account details" />
    {loading ? <p
      className="tm-settings-loading"
      role="status"
    >Loading account settings…</p> : loadError ? <>
      <Notice
        message="Your account settings couldn’t be loaded."
        type="error"
      />
      <button
        className="tm-settings-button tm-settings-button--secondary"
        onClick={() => setReload(reload + 1)}
      >Try again</button>
    </> : <>
      <Notice {...notice} />
      <form
        className="tm-settings-form"
        onSubmit={saveAccount}
        aria-busy={busy === "save"}
      >
        <div className="tm-settings-field-row">
          <div className="tm-settings-field-description">
            <label htmlFor="account-username">Username</label>
            <p>Your unique name on TalentMatch.</p>
          </div>
          <input
            id="account-username"
            autoComplete="username"
            required
            value={username}
            onChange={event => setUsername(event.target.value)}
            disabled={!!busy}
          />
        </div>
        <div className="tm-settings-field-row">
          <div className="tm-settings-field-description">
            <label htmlFor="account-email">Primary email</label>
            <p>For sign-in and account recovery.</p>
          </div>
          <div className="tm-settings-field-stack">
            <input
              id="account-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={event => setEmail(event.target.value)}
              disabled={!!busy}
            />
            <span className={`tm-settings-badge${emailVerified && email === savedEmail ? " tm-settings-badge--success" : ""}`}>
              {emailVerified && email === savedEmail ? <>
                <FiCheckCircle aria-hidden="true" />
                Email verified
              </> : "Not verified"}
            </span>
          </div>
        </div>
        <div className="tm-settings-form-footer tm-settings-form-footer--end">
          <button
            className="tm-settings-button tm-settings-button--primary"
            disabled={!!busy}
          >
            {busy === "save" ? "Saving…" : "Save changes"}
            <FiCheck aria-hidden="true" />
          </button>
        </div>
      </form>
      <section
        className="tm-settings-section"
        aria-labelledby="verify-email-title"
      >
        <h3 id="verify-email-title">Email verification</h3>
        {emailVerified ? <p className="tm-settings-inline-status">
          <FiCheckCircle aria-hidden="true" />
          Your saved email is verified.
        </p> : <>
          <p>
            {"Confirm your email with a 6-digit code sent to "}
            {savedEmail}
            .
          </p>
          {email !== savedEmail && <p className="tm-settings-hint">Save your new email before requesting a code.</p>}
          <form
            onSubmit={verifyEmail}
            className="tm-settings-verification-form"
          >
            <div>
              <label htmlFor="verification-code">Verification code</label>
              <input
                id="verification-code"
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                value={verificationCode}
                onChange={event => setVerificationCode(event.target.value)}
                placeholder="000000"
                disabled={!!busy || email !== savedEmail}
              />
            </div>
            <button
              className="tm-settings-button tm-settings-button--primary"
              disabled={!!busy || email !== savedEmail}
            >
              {busy === "verify" ? "Verifying…" : "Verify email"}
            </button>
            <button
              type="button"
              className="tm-settings-button tm-settings-button--secondary"
              onClick={sendCode}
              disabled={!!busy || cooldown > 0 || email !== savedEmail}
            >
              {busy === "send" ? "Sending…" : cooldown ? `Send again in ${cooldown}s` : "Send code"}
            </button>
          </form>
        </>}
      </section>
      <section
        className="tm-settings-section tm-settings-danger"
        aria-labelledby="delete-account-title"
      >
        <div>
          <h3 id="delete-account-title">Delete account</h3>
          <p>
            Permanently remove your account and TalentMatch data. This cannot be undone.
          </p>
        </div>
        <button
          type="button"
          className="tm-settings-button tm-settings-button--danger"
          onClick={deleteAccount}
          disabled={!!busy}
        >
          <FiTrash2 aria-hidden="true" />
          {busy === "delete" ? "Deleting…" : "Delete account"}
        </button>
      </section>
    </>}
  </>;
}
function Notifications() {
  return <>
    <SectionHeading title="Notifications" />
    <section className="tm-settings-empty-state">
      <span className="tm-settings-empty-icon">
        <FiBell aria-hidden="true" />
      </span>
      <div>
        <h3>No notification preferences yet</h3>
        <p>You can manage your account email in Account details.</p>
        <Link
          to="/dashboard/settings/account"
          className="tm-settings-text-link"
        >
          {"Manage account email "}
          <FiArrowRight aria-hidden="true" />
        </Link>
      </div>
    </section>
  </>;
}
function deviceName(value = "") {
  const ua = (value || "").toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return "iPhone / iPad";
  if (ua.includes("android")) return "Android";
  if (ua.includes("windows")) return "Windows PC";
  if (/mac os x|macintosh/.test(ua)) return "Mac";
  if (ua.includes("linux")) return "Linux";
  return "Unknown device";
}
function browserName(value = "") {
  const ua = (value || "").toLowerCase();
  if (ua.includes("edg/")) return "Microsoft Edge";
  if (/opr\/|opera/.test(ua)) return "Opera";
  if (ua.includes("chrome/")) return "Google Chrome";
  if (ua.includes("firefox")) return "Mozilla Firefox";
  if (ua.includes("safari")) return "Safari";
  return "Unknown browser";
}
function formatTime(value) {
  if (!value) return "Time unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Time unavailable" : date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}
function Security() {
  const {
    user,
    logout
  } = useAuth();
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(null);
  const [notice, setNotice] = useState({});
  const fetchLogins = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const {
        data
      } = await axios.get(`${BASE_URL}/account/login-activity/`, {
        headers: headersFor(user)
      });
      setEvents(Array.isArray(data.events) ? data.events : []);
    } catch (error) {
      setLoadError(errorMessage(error, "Login activity couldn’t be loaded."));
    } finally {
      setLoading(false);
    }
  }, [user?.token]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    fetchLogins();
  }, [fetchLogins]);
  const revokeSession = async sessionId => {
    const all = sessionId === "all";
    if (!window.confirm(all ? "Sign out from all devices? This will log you out everywhere, including this browser." : "Are you sure you want to log out this session?")) return;
    setBusy(sessionId);
    setNotice({});
    try {
      await axios.post(`${BASE_URL}/account/${all ? "logout-all-sessions" : "logout-session"}/`, all ? null : {
        session_id: sessionId
      }, {
        headers: headersFor(user)
      });
      if (all || events.some(event => event.session_id === sessionId && event.current_session)) {
        logout();
        navigate("/login");
      } else {
        setNotice({
          message: "Session signed out."
        });
        await fetchLogins();
      }
    } catch (error) {
      setNotice({
        message: errorMessage(error, "The session couldn’t be signed out. Please try again."),
        type: "error"
      });
    } finally {
      setBusy(null);
    }
  };
  return <>
    <SectionHeading title="Password & security">Stay in control of access to your account.</SectionHeading>
    <Notice {...notice} />
    <AccountPasswordForm />
    <section
      className="tm-settings-section"
      aria-labelledby="recent-logins-title"
    >
      <div className="tm-settings-section-toolbar">
        <div>
          <h3 id="recent-logins-title">Recent logins</h3>
          <p>Review the devices that have accessed your account.</p>
        </div>
        <button
          className="tm-settings-button tm-settings-button--secondary"
          onClick={() => revokeSession("all")}
          disabled={!!busy}
        >
          <FiLogOut aria-hidden="true" />
          {busy === "all" ? "Signing out…" : "Sign out all devices"}
        </button>
      </div>
      {loading ? <p
        className="tm-settings-loading"
        role="status"
      >Loading login activity…</p> : loadError ? <>
        <Notice
          message={loadError}
          type="error"
        />
        <button
          className="tm-settings-button tm-settings-button--secondary"
          onClick={fetchLogins}
        >Try again</button>
      </> : events.length === 0 ? <p className="tm-settings-hint">No login activity found yet.</p> : <ul className="tm-settings-sessions">
        {events.map((event, index) => <li
          key={event.id || `${event.session_id}-${index}`}
          className="tm-settings-session"
        >
          <span className="tm-settings-device-icon">
            <FiMonitor aria-hidden="true" />
          </span>
          <div className="tm-settings-session-info">
            <h4>
              {deviceName(event.device)}
              {" "}
              <span>
                {"· "}
                {browserName(event.device)}
              </span>
            </h4>
            <p>
              {formatTime(event.timestamp)}
            </p>
            <p>
              {event.ip || "IP unavailable"}
              {event.location ? ` · ${event.location}` : ""}
            </p>
          </div>
          {event.current_session ? <span className="tm-settings-badge">
            <FiCheck aria-hidden="true" />
            This device
          </span> : event.session_id ? <button
            type="button"
            className="tm-settings-button tm-settings-button--secondary tm-settings-session-action"
            onClick={() => revokeSession(event.session_id)}
            disabled={!!busy}
            aria-label={`Sign out ${deviceName(event.device)} session from ${formatTime(event.timestamp)}`}
          >
            {busy === event.session_id ? "Signing out…" : "Sign out"}
          </button> : null}
        </li>)}
      </ul>}
    </section>
    <section className="tm-settings-section tm-settings-feature-row">
      <span className="tm-settings-device-icon">
        <FiLock aria-hidden="true" />
      </span>
      <div>
        <h3>Two-factor authentication</h3>
        <p>Additional sign-in verification isn’t available yet.</p>
      </div>
      <span className="tm-settings-badge">Coming soon</span>
    </section>
  </>;
}
const settingsLinks = [{
  name: "Profile",
  path: "profile",
  icon: FiUser
}, {
  name: "Account",
  path: "account",
  icon: FiSettings
}, {
  name: "Notifications",
  path: "notifications",
  icon: FiBell
}, {
  name: "Security",
  path: "security",
  icon: FiShield
}];
export default function ProfileSettings() {
  return <main
    id="main-content"
    className="tm-settings"
  >
    <header className="tm-settings-header">
      <div>
        <Link
          to="/dashboard"
          className="tm-settings-back"
        >
          <FiArrowLeft aria-hidden="true" />
          Back to dashboard
        </Link>
        <h1>
          Settings
          <span>.</span>
        </h1>
      </div>
      <span className="tm-settings-header-icon">
        <FiSettings aria-hidden="true" />
      </span>
    </header>
    <div className="tm-settings-layout">
      <aside className="tm-settings-sidebar">
        <p className="tm-settings-nav-label">YOUR ACCOUNT</p>
        <nav aria-label="Settings">
          {settingsLinks.map(({
            name,
            path,
            icon: Icon
          }) => <NavLink
            key={path}
            to={`/dashboard/settings/${path}`}
            className={({
              isActive
            }) => `tm-settings-nav-link${isActive ? " is-active" : ""}`}
          >
            <Icon aria-hidden="true" />
            <span>{name}</span>
            <FiChevronRight
              className="tm-settings-nav-chevron"
              aria-hidden="true"
            />
          </NavLink>)}
        </nav>
      </aside>
      <div className="tm-settings-content">
        <Routes>
          <Route
            index
            element={<Navigate
              to="/dashboard/settings/profile"
              replace
            />}
          />
          <Route
            path="profile"
            element={<ProfileDetails />}
          />
          <Route
            path="account"
            element={<AccountSettings />}
          />
          <Route
            path="notifications"
            element={<Notifications />}
          />
          <Route
            path="security"
            element={<Security />}
          />
          <Route
            path="*"
            element={<Navigate
              to="/dashboard/settings/profile"
              replace
            />}
          />
        </Routes>
      </div>
    </div>
  </main>;
}
