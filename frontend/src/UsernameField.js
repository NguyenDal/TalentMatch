import React from "react";
import { FiUser } from "react-icons/fi";
import AuthField from "./AuthField";
import "./GoogleAuth.css";

export default function UsernameField({ id, availability, ...props }) {
  const invalid = ["invalid", "unavailable"].includes(availability.status);
  return (
    <div className="tm-username-field" data-status={availability.status}>
      <AuthField id={id} label="Username" name="username" icon={FiUser}
        placeholder="Choose a username" autoComplete="username" autoCapitalize="none"
        spellCheck={false} minLength={3} maxLength={30} pattern="[A-Za-z0-9_]{3,30}"
        aria-invalid={invalid} aria-describedby={`${id}-status`} required {...props} />
      <p className="tm-username-status" id={`${id}-status`} aria-live="polite" aria-atomic="true">
        {availability.status === "available" && <span aria-hidden="true">✓ </span>}
        {invalid && <span aria-hidden="true">! </span>}
        {availability.message}
      </p>
    </div>
  );
}
