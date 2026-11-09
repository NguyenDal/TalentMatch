import React, { useEffect, useId, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { FiArrowUpRight, FiLayers, FiMenu, FiX } from "react-icons/fi";
import "./PublicNavBar.css";
import ThemeToggle from "./ThemeToggle";

function scrollToSteps() {
  const target = document.getElementById("how-it-works");
  if (target) {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
  }
}

// A light navigation bar on the landing page, with a contrasting variant for auth pages.
export default function PublicNavBar({ variant = "contrast" }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const menuButton = useRef(null);
  const location = useLocation();

  useEffect(() => {
    setMenuOpen(false);
    if (location.pathname === "/" && location.hash === "#how-it-works") {
      scrollToSteps();
    }
  }, [location.pathname, location.hash]);

  const closeMenu = () => setMenuOpen(false);
  const handleStepsClick = () => {
    closeMenu();
    if (location.pathname === "/") scrollToSteps();
  };

  return (
    <header
      className={`tm-nav tm-nav--${variant}`}
      onKeyDown={(event) => {
        if (event.key === "Escape" && menuOpen) {
          closeMenu();
          menuButton.current?.focus();
        }
      }}
    >
      <div className="tm-nav__inner">
        <Link to="/" className="tm-nav__brand" aria-label="TalentMatch home" onClick={closeMenu}>
          <span className="tm-nav__brand-mark" aria-hidden="true"><FiLayers /></span>
          <span>TalentMatch<span className="tm-nav__brand-dot">.</span></span>
        </Link>

        <nav className="tm-nav__desktop-links" aria-label="Main navigation">
          <NavLink to="/" end className="tm-nav__link">Home</NavLink>
          <Link to="/#how-it-works" className="tm-nav__link" onClick={handleStepsClick}>How it works</Link>
          <NavLink to="/contact" className="tm-nav__link">Contact</NavLink>
        </nav>

        <div className="tm-nav__actions">
          {variant === "landing" && <ThemeToggle />}
          <Link to="/login" className="tm-nav__login" onClick={closeMenu}>Log in</Link>
          <Link to="/signup" className="tm-nav__signup tm-nav__desktop-signup">
            Get started <FiArrowUpRight aria-hidden="true" />
          </Link>
          <button
            ref={menuButton}
            type="button"
            className="tm-nav__menu-toggle"
            aria-label={menuOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={menuOpen}
            aria-controls={menuId}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <FiX aria-hidden="true" /> : <FiMenu aria-hidden="true" />}
          </button>
        </div>
      </div>

      <nav
        id={menuId}
        className="tm-nav__mobile-links"
        aria-label="Mobile navigation"
        hidden={!menuOpen}
      >
        <NavLink to="/" end className="tm-nav__link" onClick={closeMenu}>Home</NavLink>
        <Link to="/login" className="tm-nav__link tm-nav__mobile-login" onClick={closeMenu}>Log in</Link>
        <Link to="/#how-it-works" className="tm-nav__link" onClick={handleStepsClick}>How it works</Link>
        <NavLink to="/contact" className="tm-nav__link" onClick={closeMenu}>Contact</NavLink>
        <Link to="/signup" className="tm-nav__signup" onClick={closeMenu}>
          Get started <FiArrowUpRight aria-hidden="true" />
        </Link>
      </nav>
    </header>
  );
}
