import React from "react";

export const POLICY_VERSION = "2026-11-23";

export default function PolicyAgreement({ id, checked, onChange, disabled }) {
  return <div className="tm-policy-agreement">
    <input id={id} type="checkbox" required checked={checked} disabled={disabled}
      onChange={event => onChange(event.target.checked)} />
    <label htmlFor={id}>I agree to the <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a> and <a href="/terms" target="_blank" rel="noopener noreferrer">Terms and Conditions</a>. <span className="tm-policy-required" aria-hidden="true">*</span></label>
  </div>;
}
