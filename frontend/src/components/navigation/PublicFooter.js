import React from "react";
import { Link } from "react-router-dom";
import { FiArrowUpRight } from "react-icons/fi";
import BrandMark from "./BrandMark";

export default function PublicFooter() {
  return (
    <footer className="tm-footer">
      <div className="tm-container tm-footer-inner">
        <Link className="tm-footer-brand" to="/" aria-label="TalentMatch">
          <BrandMark size={28} /> TalentMatch<span>.</span>
        </Link>
        <nav aria-label="Footer">
          <Link to="/privacy">Privacy Policy</Link>
          <Link to="/terms">Terms and Conditions</Link>
          <Link to="/contact">Get in touch <FiArrowUpRight aria-hidden="true" /></Link>
        </nav>
      </div>
    </footer>
  );
}
