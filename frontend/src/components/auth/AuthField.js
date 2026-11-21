import React, { useState } from "react";
import { FiAlertCircle, FiEye, FiEyeOff } from "react-icons/fi";

export default function AuthField({ id, label, icon: Icon, type = "text", ...inputProps }) {
  const [visible, setVisible] = useState(false);
  const isPassword = type === "password";

  return (
    <div className="tm-auth-field">
      <label htmlFor={id}>{label}</label>
      <div className="tm-auth-input-wrap">
        {Icon && <Icon className="tm-auth-input-icon" aria-hidden="true" />}
        <input {...inputProps} id={id} type={isPassword && visible ? "text" : type} />
        {isPassword && (
          <button
            className="tm-auth-password-toggle"
            type="button"
            aria-label={visible ? "Hide password" : "Show password"}
            aria-controls={id}
            aria-pressed={visible}
            onClick={() => setVisible((value) => !value)}
            disabled={inputProps.disabled}
          >
            {visible ? <FiEyeOff aria-hidden="true" /> : <FiEye aria-hidden="true" />}
          </button>
        )}
      </div>
    </div>
  );
}

export function AuthError({ error, id = "auth-error" }) {
  if (!error) return null;
  const messages = Array.isArray(error)
    ? error.map((entry) => typeof entry === "string" ? entry : entry?.msg).filter(Boolean).join(" ")
    : typeof error === "string" ? error : error?.message;

  return (
    <div className="tm-auth-error" id={id} role="alert">
      <FiAlertCircle aria-hidden="true" />
      <span>{messages || "Something went wrong. Please try again."}</span>
    </div>
  );
}
