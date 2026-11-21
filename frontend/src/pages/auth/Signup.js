import React, { useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import { FiArrowRight, FiLock, FiMail } from "react-icons/fi";
import { BASE_URL } from "../../services/api";
import AuthLayout from "../../components/auth/AuthLayout";
import AuthField, { AuthError } from "../../components/auth/AuthField";
import GoogleAuth from "../../components/auth/GoogleAuth";
import UsernameField from "../../components/auth/UsernameField";
import useUsernameAvailability from "../../hooks/useUsernameAvailability";

export default function Signup({ onLogin }) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const availability = useUsernameAvailability(username);

  const handleSignup = async (event) => {
    event.preventDefault();
    if (!availability.available || loading) return;
    setErr("");
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append("username", username);
      params.append("email", email);
      params.append("password", password);

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
      <GoogleAuth disabled={loading} />
      <form
        className="tm-auth-form"
        onSubmit={handleSignup}
        aria-busy={loading}
        aria-describedby={err ? "auth-error signup-fields-note" : "signup-fields-note"}
      >
        <p className="tm-auth-form-note" id="signup-fields-note">All fields are required.</p>
        <UsernameField
          id="signup-username"
          availability={availability}
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
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={loading}
          required
        />
        <AuthError error={err} />
        <button className="tm-auth-submit" type="submit" disabled={loading || !availability.available}>
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
