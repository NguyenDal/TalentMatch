import React from "react";
import { Link } from "react-router-dom";
import { FiArrowUpRight, FiLayers } from "react-icons/fi";

export default function PublicFooter() {
  return (
    <footer className="tm-footer">
      <div className="tm-container tm-footer-inner">
        <Link className="tm-footer-brand" to="/" aria-label="TalentMatch home">
          <FiLayers aria-hidden="true" /> TalentMatch<span>.</span>
        </Link>
        <p>Built with purpose by An Nguyen.</p>
        <Link to="/contact">Get in touch <FiArrowUpRight aria-hidden="true" /></Link>
      </div>
    </footer>
  );
}
