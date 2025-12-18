import React, { useRef, useState, useEffect } from "react";
import { Routes, Route, NavLink, useNavigate } from "react-router-dom";
import { FiArrowLeft } from "react-icons/fi";
import axios from "axios";
import { BASE_URL } from "./api";
import { useAuth } from "./AuthContext";

function ProfileDetails() {
  const fileInput = useRef();

  const navigate = useNavigate();
  const { user: authUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [avatar, setAvatar] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [profession, setProfession] = useState("");
  const [bio, setBio] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState(""); // success | error

  useEffect(() => {
    const fetchMe = async () => {
      try {
        const token = authUser?.token || localStorage.getItem("token");
        if (!token) throw new Error("Not logged in");
        const res = await axios.get(`${BASE_URL}/me/`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        setAvatar(res.data.profile_image_url || "");
        setFirstName(res.data.first_name || "");
        setLastName(res.data.last_name || "");
        setEmail(res.data.email || "");
        setProfession(res.data.profession || "");
        setBio(res.data.bio || "");
      } catch {
        // leave fields empty if API fails
      } finally {
        setLoading(false);
      }
    };
    fetchMe();
  }, [authUser]);

  const showMessage = (text, type = "success") => {
    setMsg(text);
    setMsgType(type);
    setTimeout(() => {
      setMsg("");
      setMsgType("");
    }, 3000); // auto-hide after 3s
  };

  const handleImageUploadClick = () => fileInput.current?.click();

  const handleImageChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const preview = URL.createObjectURL(file);
    const prevAvatar = avatar;
    setAvatar(preview);

    try {
      const token = authUser?.token || localStorage.getItem("token");
      const form = new FormData();
      form.append("image", file);
      const res = await axios.post(`${BASE_URL}/upload-profile-image/`, form, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data",
        },
      });
      if (res.data?.profile_image_url) {
        setAvatar(res.data.profile_image_url);
        showMessage("Profile image updated.", "success");
      } else {
        setAvatar(prevAvatar);
        showMessage("Upload failed. Please try again.", "error");
      }
    } catch (err) {
      setAvatar(prevAvatar);
      showMessage(err.response?.data?.detail || "Upload failed.", "error");
    } finally {
      try {
        URL.revokeObjectURL(preview);
      } catch { }
    }
  };

  const handleDeleteImage = async () => {
    const prevAvatar = avatar;
    setAvatar("");

    try {
      const token = authUser?.token || localStorage.getItem("token");
      await axios.post(
        `${BASE_URL}/profile/clear-image/`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      showMessage("Profile image removed.", "success");
    } catch {
      setAvatar(prevAvatar);
      showMessage("Failed to remove image.", "error");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMsg("");
    setMsgType("");

    let saved = false;
    try {
      const token = authUser?.token || localStorage.getItem("token");

      const form = new FormData();
      form.append("first_name", firstName);
      form.append("last_name", lastName);
      form.append("email", email);
      form.append("profession", profession);
      form.append("bio", bio);

      await axios.patch(`${BASE_URL}/profile/update/`, form, {
        headers: { Authorization: `Bearer ${token}` },
      });

      saved = true;
      showMessage("Saved successfully.", "success");
    } catch (err) {
      setMsg("Save failed.");
    } finally {
      setSaving(false);
      if (saved) navigate("/dashboard"); // changed from /profile
    }
  };

  if (loading) {
    return <div className="max-w-3xl text-black">Loading profile…</div>;
  }

  return (
    <div>
      {msg && (
        <div
          className={`mb-4 px-4 py-3 rounded-md text-sm font-medium transition-opacity duration-300 ${msgType === "success"
            ? "bg-green-100 text-green-700 border border-green-300"
            : "bg-red-100 text-red-700 border border-red-300"
            }`}
        >
          {msg}
        </div>
      )}

      <form className="max-w-3xl grid grid-cols-2 gap-8" onSubmit={handleSubmit}>
        <div className="col-span-2 flex items-center gap-8 mb-6">
          <img
            src={avatar || "https://via.placeholder.com/112?text=No+Avatar"}
            alt="Profile"
            className="w-28 h-28 rounded-full border-4 border-white shadow object-cover"
          />
          <div className="flex flex-col gap-3">
            <button
              type="button"
              className="bg-gray-900 text-white px-6 py-2 rounded-md font-medium hover:bg-gray-700 transition"
              onClick={handleImageUploadClick}
            >
              Change picture
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageChange}
            />
            <button
              type="button"
              className="border border-gray-400 text-gray-700 px-6 py-2 rounded-md font-medium hover:bg-gray-100 transition"
              onClick={handleDeleteImage}
            >
              Delete picture
            </button>
          </div>
        </div>
        <div className="col-span-1">
          <label className="block text-gray-700 font-medium mb-1">First name</label>
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-4 py-2 focus:ring-2 focus:ring-blue-300 bg-white text-black"
          />
        </div>
        <div className="col-span-1">
          <label className="block text-gray-700 font-medium mb-1">Last name</label>
          <input
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-4 py-2 focus:ring-2 focus:ring-blue-300 bg-white text-black"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-gray-700 font-medium mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-4 py-2 focus:ring-2 focus:ring-blue-300 bg-white text-black"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-gray-700 font-medium mb-1">Field of study</label>
          <input
            type="text"
            value={profession}
            onChange={(e) => setProfession(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-4 py-2 focus:ring-2 focus:ring-blue-300 bg-white text-black"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-gray-700 font-medium mb-1">
            Preferred job titles
          </label>
          <textarea
            rows={3}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-4 py-2 focus:ring-2 focus:ring-blue-300 bg-white text-black"
          />
        </div>
        <div className="col-span-2 mt-6 flex justify-end">
          <button
            type="submit"
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-2 rounded-md font-bold transition"
            disabled={saving}
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}

function AccountSettings() {
  const { user: authUser, logout } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);

  // Core identity
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [emailVerified, setEmailVerified] = useState(false);

  // Email verification
  const [verificationCode, setVerificationCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [cooldown, setCooldown] = useState(0); // seconds until resend allowed

  // Save / delete state + messages
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState("success"); // "success" | "error"

  // Helper to show a temporary banner at the top of the page
  const showMessage = (text, type = "success") => {
    setMsg(text);
    setMsgType(type);
    if (text) {
      setTimeout(() => {
        setMsg("");
      }, 3000);
    }
  };

  // Countdown timer for resend button
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => {
      setCooldown((s) => (s > 1 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  // Load current account info (username, email, email_verified)
  useEffect(() => {
    const fetchAccount = async () => {
      try {
        const token = authUser?.token || localStorage.getItem("token");
        if (!token) throw new Error("Not logged in");

        const res = await axios.get(`${BASE_URL}/me/`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        setUsername(res.data.username || "");
        setEmail(res.data.email || "");
        setEmailVerified(!!res.data.email_verified);
      } catch (err) {
        console.error("Failed to load account settings", err);
        showMessage("Failed to load account settings.", "error");
      } finally {
        setLoading(false);
      }
    };

    fetchAccount();
  }, [authUser]);

  // Save username + primary email
  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    showMessage("");

    try {
      const token = authUser?.token || localStorage.getItem("token");
      const form = new FormData();
      form.append("username", username);
      form.append("email", email);

      const res = await axios.patch(`${BASE_URL}/account/update/`, form, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // Backend tells us whether email changed and if it is verified
      if (typeof res.data.email_verified === "boolean") {
        setEmailVerified(res.data.email_verified);
      }

      if (res.data.email_changed) {
        showMessage(
          "Account updated. Don’t forget to send a verification code to your new email.",
          "success"
        );
      } else {
        showMessage("Account settings updated.", "success");
      }
    } catch (err) {
      console.error(err);
      const detail =
        err?.response?.data?.detail || "Failed to save account settings.";
      showMessage(detail, "error");
    } finally {
      setSaving(false);
    }
  };

  // Explicit "Send code / Resend code" button
  const handleSendCode = async () => {
    if (emailVerified) {
      showMessage("Your email is already verified.", "success");
      return;
    }
    if (!email) {
      showMessage("Please set a primary email first.", "error");
      return;
    }
    if (cooldown > 0) return;

    setSendingCode(true);
    showMessage("");

    try {
      const token = authUser?.token || localStorage.getItem("token");
      await axios.post(`${BASE_URL}/account/send-verification/`, null, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setCooldown(60); // 60s cooldown before another send
      showMessage("Verification code sent. Please check your inbox.", "success");
    } catch (err) {
      console.error(err);
      const detail =
        err?.response?.data?.detail ||
        "Failed to send verification code. Please try again.";
      showMessage(detail, "error");
    } finally {
      setSendingCode(false);
    }
  };

  // Verify email with code
  const handleVerifyEmail = async (e) => {
    e.preventDefault();
    if (!verificationCode.trim()) {
      showMessage("Please enter the verification code.", "error");
      return;
    }

    setVerifying(true);
    showMessage("");

    try {
      const token = authUser?.token || localStorage.getItem("token");
      const params = new URLSearchParams();
      params.append("code", verificationCode.trim());

      const res = await axios.post(
        `${BASE_URL}/account/verify-email/`,
        params,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (res.data?.email_verified) {
        setEmailVerified(true);
        setVerificationCode("");
        showMessage("Email verified successfully.", "success");
      } else {
        showMessage("Could not verify email.", "error");
      }
    } catch (err) {
      console.error(err);
      const detail =
        err?.response?.data?.detail ||
        "Invalid or expired verification code.";
      showMessage(detail, "error");
    } finally {
      setVerifying(false);
    }
  };

  // Delete account with confirmation popup
  const handleDeleteAccount = async () => {
    const confirmed = window.confirm(
      "Are you sure you want to delete your account? This action can't be undone."
    );
    if (!confirmed) return;

    setDeleting(true);
    showMessage("");

    try {
      const token = authUser?.token || localStorage.getItem("token");
      await axios.delete(`${BASE_URL}/account/delete/`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // Log out locally and send user to default page (public "/")
      logout();
      navigate("/");
    } catch (err) {
      console.error(err);
      const detail =
        err?.response?.data?.detail || "Failed to delete account.";
      showMessage(detail, "error");
      setDeleting(false);
    }
  };

  if (loading) {
    return <div className="max-w-3xl text-black">Loading account settings…</div>;
  }

  return (
    <div className="max-w-3xl text-black">
      {msg && (
        <div
          className={`mb-4 px-4 py-3 rounded-md text-sm font-medium ${msgType === "success"
            ? "bg-green-100 text-green-700 border border-green-300"
            : "bg-red-100 text-red-700 border border-red-300"
            }`}
        >
          {msg}
        </div>
      )}

      {/* 1. Username & primary email (top of page) */}
      <form className="space-y-8" onSubmit={handleSave}>
        <section>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">
            Account identity
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            Update your username and primary email. We’ll check if they are
            already in use by another account.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Username */}
            <div>
              <label className="block text-gray-700 font-medium mb-1">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-4 py-2 focus:ring-2 focus:ring-blue-300 bg-white text-black"
              />
              <p className="text-xs text-gray-500 mt-1">
                Shown on your dashboard and social-style feed.
              </p>
            </div>

            {/* Primary email */}
            <div>
              <label className="block text-gray-700 font-medium mb-1">
                Primary email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-4 py-2 focus:ring-2 focus:ring-blue-300 bg-white text-black"
              />
              <p className="text-xs text-gray-500 mt-1">
                Used for login, password reset, and important notifications.
              </p>
              <div className="mt-1 text-xs">
                {emailVerified ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">
                    ● Email verified
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-700 border border-yellow-200">
                    ● Not verified yet
                  </span>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Save button for identity changes */}
        <div className="flex justify-end">
          <button
            type="submit"
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-2 rounded-md font-bold transition"
            disabled={saving}
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </form>

      {/* 2. Email verification code input */}
      <section className="mt-10 border-t border-gray-200 pt-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">
          Verify your email
        </h3>
        <p className="text-sm text-gray-600 mb-3">
          After changing your email, you can send a 6-digit code to the address
          above. You can also request a new code at any time.
        </p>

        <form className="space-y-3" onSubmit={handleVerifyEmail}>
          {/* Code input + Verify button (ENTER will submit this form) */}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <input
              type="text"
              maxLength={6}
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value)}
              className="w-full sm:w-40 rounded-md border border-gray-300 px-4 py-2 focus:ring-2 focus:ring-blue-300 bg-white text-black tracking-[0.3em] text-center"
              placeholder="123456"
            />
            <button
              type="submit"
              className="bg-gray-900 hover:bg-gray-700 text-white px-6 py-2 rounded-md font-semibold transition"
              disabled={verifying}
            >
              {verifying ? "Verifying..." : "Verify email"}
            </button>
          </div>

          {/* Send / resend code BELOW text + verify button */}
          <button
            type="button"
            onClick={handleSendCode}
            className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-800 px-4 py-2 rounded-md text-sm font-semibold transition disabled:opacity-60"
            disabled={sendingCode || cooldown > 0}
          >
            {sendingCode
              ? "Sending..."
              : cooldown > 0
                ? `Send again in ${cooldown}s`
                : "Send verification code"}
          </button>
        </form>
      </section>

      {/* 3. Danger zone – delete account */}
      <section className="mt-10 border-t border-gray-200 pt-6">
        <h3 className="text-lg font-semibold text-red-600 mb-2">
          Danger zone
        </h3>
        <p className="text-sm text-gray-600 mb-3">
          Deleting your account will remove your TalentMatch data (profile,
          matches, and related content). This action can’t be undone.
        </p>
        <button
          type="button"
          onClick={handleDeleteAccount}
          className="px-4 py-2 rounded-md border border-red-300 text-red-700 hover:bg-red-50 text-sm font-semibold transition"
          disabled={deleting}
        >
          {deleting ? "Deleting…" : "Delete my account"}
        </button>
      </section>
    </div>
  );
}

function Notifications() {
  return <div className="max-w-3xl text-black">Notification settings go here.</div>;
}

function Security() {
  const { user: authUser, logout } = useAuth();
  const navigate = useNavigate();

  // Change password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPw, setChangingPw] = useState(false);

  // Login activity state
  const [loginEvents, setLoginEvents] = useState([]);
  const [loadingLogins, setLoadingLogins] = useState(true);
  const [loginsError, setLoginsError] = useState("");

  // Remote logout state
  const [loggingOutSessionId, setLoggingOutSessionId] = useState(null);

  // Messages
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState("success"); // success | error

  const showMessage = (text, type = "success") => {
    setMsg(text);
    setMsgType(type);
    if (text) {
      setTimeout(() => setMsg(""), 3000);
    }
  };

  // --- Helpers for login table ---

  const formatLoginTime = (ts) => {
    if (!ts) return "—";
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts; // fallback if not a valid date
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const getOSNameFromUserAgent = (ua = "") => {
    const s = ua.toLowerCase();
    if (s.includes("windows")) return "Windows PC";
    if (s.includes("mac os x") || s.includes("macintosh")) return "Mac";
    if (s.includes("iphone") || s.includes("ipad") || s.includes("ipod"))
      return "iPhone / iPad";
    if (s.includes("android")) return "Android";
    if (s.includes("linux")) return "Linux";
    return "Unknown device";
  };

  const getBrowserNameFromUserAgent = (ua = "") => {
    const s = ua.toLowerCase();
    if (s.includes("edg/")) return "Microsoft Edge";
    if (s.includes("opr/") || s.includes("opera")) return "Opera";
    if (s.includes("chrome/") && !s.includes("edg/") && !s.includes("opr/"))
      return "Google Chrome";
    if (s.includes("safari") && !s.includes("chrome")) return "Safari";
    if (s.includes("firefox")) return "Mozilla Firefox";
    return "Unknown browser";
  };

  // Fetch recent login activity
  useEffect(() => {
    const fetchLogins = async () => {
      try {
        const token = authUser?.token || localStorage.getItem("token");
        if (!token) throw new Error("Not logged in");

        const res = await axios.get(`${BASE_URL}/account/login-activity/`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        setLoginEvents(res.data?.events || []);
      } catch (err) {
        console.error("Failed to load login activity", err);
        setLoginsError(
          err?.response?.data?.detail || "Failed to load login activity."
        );
      } finally {
        setLoadingLogins(false);
      }
    };

    fetchLogins();
  }, [authUser]);

  // Handle change password
  const handleChangePassword = async (e) => {
    e.preventDefault();

    if (!currentPassword || !newPassword || !confirmPassword) {
      showMessage("Please fill in all password fields.", "error");
      return;
    }
    if (newPassword !== confirmPassword) {
      showMessage("New password and confirmation do not match.", "error");
      return;
    }

    setChangingPw(true);
    showMessage("");

    try {
      const token = authUser?.token || localStorage.getItem("token");
      const form = new FormData();
      form.append("current_password", currentPassword);
      form.append("new_password", newPassword);

      const res = await axios.post(
        `${BASE_URL}/account/change-password/`,
        form,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      showMessage(
        res.data?.message || "Password changed successfully.",
        "success"
      );
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      console.error(err);
      const detail =
        err?.response?.data?.detail || "Failed to change password.";
      showMessage(detail, "error");
    } finally {
      setChangingPw(false);
    }
  };

  // Handle remote logout for a past session
  const handleRemoteLogout = async (sessionId) => {
    if (!sessionId) {
      showMessage("Unable to log out this session (missing ID).", "error");
      return;
    }

    const confirmed = window.confirm(
      "Log out this session? This will force that device to sign in again."
    );
    if (!confirmed) return;

    try {
      setLoggingOutSessionId(sessionId);
      const token = authUser?.token || localStorage.getItem("token");
      if (!token) throw new Error("Not logged in");

      await axios.post(
        `${BASE_URL}/account/logout-session/`,
        { session_id: sessionId },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      showMessage("Session has been logged out.", "success");

      // Remove that session from the list in the UI
      setLoginEvents((prev) =>
        prev.filter((ev) => ev.session_id !== sessionId)
      );
    } catch (err) {
      console.error("Failed to log out session", err);
      const detail =
        err?.response?.data?.detail || "Failed to log out that session.";
      showMessage(detail, "error");
    } finally {
      setLoggingOutSessionId(null);
    }
  };

  return (
    <div className="max-w-3xl text-black">
      {msg && (
        <div
          className={`mb-4 px-4 py-3 rounded-md text-sm font-medium ${msgType === "success"
            ? "bg-green-100 text-green-700 border border-green-300"
            : "bg-red-100 text-red-700 border border-red-300"
            }`}
        >
          {msg}
        </div>
      )}

      {/* 1. Change password */}
      <section className="mb-10">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">
          Change password
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          Update your password to keep your account secure.
        </p>

        <form className="space-y-4" onSubmit={handleChangePassword}>
          <div>
            <label className="block text-gray-700 font-medium mb-1">
              Current password
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-4 py-2 focus:ring-2 focus:ring-blue-300 bg-white text-black"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-gray-700 font-medium mb-1">
                New password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-4 py-2 focus:ring-2 focus:ring-blue-300 bg-white text-black"
              />
            </div>
            <div>
              <label className="block text-gray-700 font-medium mb-1">
                Confirm new password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-4 py-2 focus:ring-2 focus:ring-blue-300 bg-white text-black"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="bg-gray-900 hover:bg-gray-700 text-white px-6 py-2 rounded-md font-semibold transition"
              disabled={changingPw}
            >
              {changingPw ? "Updating..." : "Update password"}
            </button>
          </div>
        </form>
      </section>

      {/* 2. Recent logins */}
      <section className="mb-10 border-t border-gray-200 pt-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">
          Recent logins
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          Review where your account has been accessed recently.
        </p>

        {loadingLogins ? (
          <p className="text-sm text-gray-500">Loading login activity…</p>
        ) : loginsError ? (
          <p className="text-sm text-red-600">{loginsError}</p>
        ) : loginEvents.length === 0 ? (
          <p className="text-sm text-gray-500">
            No login activity found yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm border border-gray-200 rounded-md overflow-hidden">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-gray-700 font-semibold">
                    Date &amp; time
                  </th>
                  <th className="px-4 py-2 text-left text-gray-700 font-semibold">
                    IP address
                  </th>
                  <th className="px-4 py-2 text-left text-gray-700 font-semibold">
                    Operating system
                  </th>
                  <th className="px-4 py-2 text-left text-gray-700 font-semibold">
                    Browser
                  </th>
                  <th className="px-4 py-2 text-left text-gray-700 font-semibold">
                    Location
                  </th>
                  <th className="px-4 py-2 text-left text-gray-700 font-semibold">
                    Session
                  </th>
                </tr>
              </thead>
              <tbody>
                {loginEvents.map((ev, idx) => {
                  const isCurrent = !!ev.current_session;
                  return (
                    <tr
                      key={idx}
                      className={
                        isCurrent
                          ? "bg-blue-50"
                          : idx % 2 === 0
                            ? "bg-white"
                            : "bg-gray-50"
                      }
                    >
                      <td className="px-4 py-2 text-gray-800">
                        {formatLoginTime(ev.timestamp)}
                      </td>
                      <td className="px-4 py-2 text-gray-800">
                        {ev.ip || "—"}
                      </td>
                      <td className="px-4 py-2 text-gray-800">
                        {getOSNameFromUserAgent(ev.device || "")}
                      </td>
                      <td className="px-4 py-2 text-gray-800">
                        {getBrowserNameFromUserAgent(ev.device || "")}
                      </td>
                      <td className="px-4 py-2 text-gray-800">
                        {ev.location || "—"}
                      </td>
                      <td className="px-4 py-2 text-gray-800">
                        {isCurrent ? (
                          <span
                            className="inline-flex items-center px-3 py-1 rounded-full bg-blue-100 text-blue-700 border border-blue-200 text-xs font-semibold whitespace-nowrap"
                          >
                            Current device
                          </span>
                        ) : (
                          ev.session_id && (
                            <button
                              type="button"
                              onClick={() => handleRemoteLogout(ev.session_id)}
                              disabled={loggingOutSessionId === ev.session_id}
                              className="inline-flex items-center px-3 py-1 rounded-full border border-red-200 bg-red-100 text-red-700 text-xs font-semibold hover:bg-red-200 disabled:opacity-50 whitespace-nowrap"
                            >
                              {loggingOutSessionId === ev.session_id ? "Logging out…" : "Log out"}
                            </button>
                          )
                        )}
                      </td>


                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 3. Two-factor authentication (placeholder / future) */}
      <section className="border-t border-gray-200 pt-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">
          Two-factor authentication (2FA)
        </h3>
        <p className="text-sm text-gray-600 mb-3">
          Add an extra layer of security by requiring a one-time code when you
          log in. Support for authenticator apps and SMS codes is planned.
        </p>
        <div className="flex items-center justify-between border border-dashed border-gray-300 rounded-md px-4 py-3 bg-gray-50">
          <div>
            <p className="text-sm font-medium text-gray-800">
              2FA is not available yet
            </p>
            <p className="text-xs text-gray-500">
              This is a placeholder section. Once implemented, you&apos;ll be able
              to enable 2FA here.
            </p>
          </div>
          <button
            type="button"
            className="px-4 py-2 rounded-md border border-gray-300 text-gray-500 text-sm font-semibold cursor-not-allowed"
            disabled
          >
            Coming soon
          </button>
        </div>
      </section>
    </div>
  );
}

export default function ProfileSettings() {
  const sidebar = [
    { name: "Public profile", path: "/dashboard/settings/profile" },
    { name: "Account settings", path: "/dashboard/settings/account" },
    { name: "Notifications", path: "/dashboard/settings/notifications" },
    { name: "Security", path: "/dashboard/settings/security" },
  ];

  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center w-full bg-gradient-to-br from-blue-100 to-purple-200 py-10 min-h-[90vh]">
      <div
        className="w-full max-w-6xl mx-auto shadow-xl rounded-2xl bg-white flex"
        style={{ minHeight: "650px" }}
      >
        <aside className="w-72 border-r border-gray-200 px-8 py-10 relative">
          <button
            onClick={() => navigate("/dashboard")}
            className="absolute left-4 top-4 bg-blue-100 hover:bg-blue-200 text-blue-600 rounded-full shadow-lg p-2 transition flex items-center justify-center"
            style={{
              boxShadow: "0 4px 16px 0 rgba(0,0,0,0.07)",
              border: "2px solid white",
            }}
            aria-label="Back to dashboard"
          >
            <FiArrowLeft size={24} />
          </button>
          <h2 className="text-2xl font-bold mb-8 text-gray-800 mt-9">
            Settings
          </h2>
          <nav className="flex flex-col gap-2">
            {sidebar.map((item) => (
              <NavLink
                key={item.name}
                to={item.path}
                end={item.path === "/dashboard/settings"}
                className={({ isActive }) =>
                  "px-4 py-2 text-left rounded-md font-medium transition " +
                  (isActive
                    ? "bg-blue-100 text-blue-700"
                    : "hover:bg-gray-50 text-gray-700")
                }
              >
                {item.name}
              </NavLink>
            ))}
          </nav>
        </aside>
        <section className="flex-1 px-16 py-12 min-w-0 flex flex-col">
          <Routes>
            {/* use nested (relative) paths under /dashboard/settings/* */}
            <Route path="profile" element={<ProfileDetails />} />
            <Route path="account" element={<AccountSettings />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="security" element={<Security />} />
          </Routes>
        </section>
      </div>
    </div>
  );
}