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
      } catch {}
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
          className={`mb-4 px-4 py-3 rounded-md text-sm font-medium transition-opacity duration-300 ${
            msgType === "success"
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
          <label className="block text-gray-700 font-medium mb-1">Preferred job titles</label>
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
  return <div className="max-w-3xl text-black">Account settings go here (change password, etc).</div>;
}
function Notifications() {
  return <div className="max-w-3xl text-black">Notification settings go here.</div>;
}
function Security() {
  return <div className="max-w-3xl text-black">Security settings go here (2FA, etc).</div>;
}

export default function SettingsPage() {
  const sidebar = [
    { name: "Public profile", path: "/profile" },
    { name: "Account settings", path: "/profile/account" },
    { name: "Notifications", path: "/profile/notifications" },
    { name: "Security", path: "/profile/security" },
  ];

  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center w-full bg-gradient-to-br from-blue-100 to-purple-200 py-10 min-h-[90vh]">
      <div className="w-full max-w-6xl mx-auto shadow-xl rounded-2xl bg-white flex"
        style={{ minHeight: "650px" }}
      >
        <aside className="w-72 border-r border-gray-200 px-8 py-10 relative">
          <button
            onClick={() => navigate("/profile")}
            className="absolute left-4 top-4 bg-blue-100 hover:bg-blue-200 text-blue-600 rounded-full shadow-lg p-2 transition flex items-center justify-center"
            style={{
              boxShadow: "0 4px 16px 0 rgba(0,0,0,0.07)",
              border: "2px solid white",
            }}
            aria-label="Back to profile"
          >
            <FiArrowLeft size={24} />
          </button>
          <h2 className="text-2xl font-bold mb-8 text-gray-800 mt-9">Settings</h2>
          <nav className="flex flex-col gap-2">
            {sidebar.map(item => (
              <NavLink
                key={item.name}
                to={item.path}
                end={item.path === "/profile"}
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
            <Route path="/" element={<ProfileDetails />} />
            <Route path="/account" element={<AccountSettings />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/security" element={<Security />} />
          </Routes>
        </section>
      </div>
    </div>
  );
}