import React, { useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import { FiArrowRight, FiLock, FiMail, FiUser } from "react-icons/fi";
import { BASE_URL } from "./api";
import AuthLayout from "./AuthLayout";
import AuthField, { AuthError } from "./AuthField";

export default function Signup({ onLogin }) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignup = async (event) => {
    event.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append("username", username);
      params.append("email", email);
      params.append("password", password);
      params.append("first_name", firstName);
      params.append("last_name", lastName);

      await axios.post(BASE_URL + "/register/", params, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });

      // Preserve automatic login after successful registration.
      const loginParams = new URLSearchParams();
      loginParams.append("username", username);
      loginParams.append("password", password);
      loginParams.append("grant_type", "password");

      const res = await axios.post(BASE_URL + "/login/", loginParams, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      onLogin(res.data);
    } catch (error) {
      setErr(error.response?.data?.detail || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      mode="signup"
      title="Create your account."
      subtitle="Bring your experience. Let's find where it fits."
    >
      <form
        className="tm-auth-form"
        onSubmit={handleSignup}
        aria-busy={loading}
        aria-describedby={err ? "auth-error signup-fields-note" : "signup-fields-note"}
      >
        <p className="tm-auth-form-note" id="signup-fields-note">All fields are required.</p>
        <div className="tm-auth-name-row">
          <AuthField
            id="signup-first-name"
            name="first_name"
            label="First name"
            placeholder="First name"
            autoComplete="given-name"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            disabled={loading}
            required
          />
          <AuthField
            id="signup-last-name"
            name="last_name"
            label="Last name"
            placeholder="Last name"
            autoComplete="family-name"
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            disabled={loading}
            required
          />
        </div>
        <AuthField
          id="signup-username"
          name="username"
          label="Username"
          icon={FiUser}
          placeholder="Choose a username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          disabled={loading}
          required
        />
        <AuthField
          id="signup-email"
          name="email"
          label="Email address"
          type="email"
          icon={FiMail}
          placeholder="you@example.com"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={loading}
          required
        />
        <AuthField
          id="signup-password"
          name="password"
          label="Password"
          type="password"
          icon={FiLock}
          placeholder="Create a password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={loading}
          required
        />
        <AuthError error={err} />
        <button className="tm-auth-submit" type="submit" disabled={loading}>
          {loading ? "Creating your account..." : "Create account"}
          {!loading && <FiArrowRight aria-hidden="true" />}
        </button>
      </form>
      <p className="tm-auth-switch">
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </AuthLayout>
  );
}
