import React, { useEffect, useId, useRef, useState } from "react";
import axios from "axios";
import { Link, NavLink, useLocation } from "react-router-dom";
import { FiArrowUpRight, FiGrid, FiLayers, FiLogOut, FiSettings, FiTarget } from "react-icons/fi";
import { useAuth } from "./AuthContext";
import { BASE_URL } from "./api";
import ThemeToggle from "./ThemeToggle";
import "./NavBar.css";

export default function NavBar({ setMenu }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [profile, setProfile] = useState(null);
  const [imageFailed, setImageFailed] = useState(false);
  const profileWrap = useRef(null);
  const avatarButton = useRef(null);
  const profileMenu = useRef(null);
  const menuId = useId();
  const username = profile?.username || user?.username || "Your account";
  const imageUrl = profile?.profile_image_url;

  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  useEffect(() => {
    if (!user?.token) return undefined;
    const controller = new AbortController();
    axios.get(`${BASE_URL}/me/`, {
      headers: { Authorization: `Bearer ${user.token}` },
      signal: controller.signal,
    }).then(({ data }) => {
      if (!controller.signal.aborted) setProfile(data);
    }).catch(() => {});
    return () => controller.abort();
  }, [user?.token, location.pathname]);

  useEffect(() => {
    const updateImage = (event) => {
      if (typeof event.detail?.url === "string") {
        setProfile((current) => ({ ...current, profile_image_url: event.detail.url }));
      }
    };
    window.addEventListener("talentmatch:profile-image-updated", updateImage);
    return () => window.removeEventListener("talentmatch:profile-image-updated", updateImage);
  }, []);

  useEffect(() => { setImageFailed(false); }, [imageUrl]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    profileMenu.current?.querySelector('[role="menuitem"]')?.focus();
    const closeOutside = (event) => {
      if (!profileWrap.current?.contains(event.target)) setMenuOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        avatarButton.current?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("focusin", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("focusin", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  const choosePage = (page) => {
    setMenu?.(page);
    setMenuOpen(false);
  };

  const moveMenuFocus = (event) => {
    const items = Array.from(profileMenu.current.querySelectorAll('[role="menuitem"]'));
    const index = items.indexOf(document.activeElement);
    let next;
    if (event.key === "ArrowDown") next = (index + 1) % items.length;
    if (event.key === "ArrowUp") next = (index - 1 + items.length) % items.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = items.length - 1;
    if (next !== undefined) {
      event.preventDefault();
      items[next]?.focus();
    }
  };

  return (
    <header className="tm-app-nav">
      <div className="tm-app-nav-inner">
        <Link to="/" className="tm-app-brand" aria-label="TalentMatch home" onClick={() => choosePage("matcher")}>
          <span className="tm-app-brand-mark" aria-hidden="true"><FiLayers /></span>
          <span>TalentMatch<span className="tm-app-brand-dot">.</span></span>
        </Link>

        <nav className="tm-app-links" aria-label="Workspace navigation">
          <NavLink to="/" end className="tm-app-link" onClick={() => choosePage("matcher")}>
            <FiTarget aria-hidden="true" /> <span>Job matching</span>
          </NavLink>
          <NavLink to="/dashboard" className="tm-app-link" onClick={() => choosePage("dashboard")}>
            <FiGrid aria-hidden="true" /> <span>Dashboard</span>
          </NavLink>
        </nav>

        <div className="tm-app-nav-actions">
          <ThemeToggle />
          {user && <div className="tm-app-profile" ref={profileWrap}>
            <div className={`tm-app-profile-identity${menuOpen ? " is-open" : ""}`}>
              <span className="tm-app-profile-name" aria-hidden="true">{username}</span>
              <button ref={avatarButton} className="tm-app-avatar" type="button"
                aria-label={`Open account menu for ${username}`} aria-haspopup="menu"
                aria-expanded={menuOpen} aria-controls={menuId}
                onClick={() => setMenuOpen((open) => !open)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                    event.preventDefault(); setMenuOpen(true);
                  }
                }}>
                {imageUrl && !imageFailed
                  ? <img src={imageUrl} alt="" onError={() => setImageFailed(true)} />
                  : <span aria-hidden="true">{username.slice(0, 2).toUpperCase()}</span>}
              </button>
            </div>
            {menuOpen && <div className="tm-app-profile-menu" id={menuId} ref={profileMenu}
              role="menu" aria-label="Your account" onKeyDown={moveMenuFocus}>
              <div className="tm-app-profile-heading" role="presentation">
                <span>Your workspace</span><strong>{username}</strong>
              </div>
              <Link to="/dashboard" role="menuitem" className="tm-app-menu-item" onClick={() => choosePage("dashboard")}>
                <FiGrid aria-hidden="true" /><span>Dashboard</span><FiArrowUpRight aria-hidden="true" />
              </Link>
              <Link to="/dashboard/settings" role="menuitem" className="tm-app-menu-item" onClick={() => choosePage("dashboard")}>
                <FiSettings aria-hidden="true" /><span>Account settings</span><FiArrowUpRight aria-hidden="true" />
              </Link>
              <div className="tm-app-menu-divider" role="separator" />
              <button type="button" role="menuitem" className="tm-app-menu-item tm-app-menu-logout"
                onClick={() => { setMenuOpen(false); logout(); }}>
                <FiLogOut aria-hidden="true" /><span>Log out</span>
              </button>
            </div>}
          </div>}
        </div>
      </div>
    </header>
  );
}
