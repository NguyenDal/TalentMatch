import React, { useState } from "react";
import { Link } from "react-router-dom";
import { FiArrowRight, FiLock, FiUser } from "react-icons/fi";
import { useAuth } from "./AuthContext";
import AuthLayout from "./AuthLayout";
import AuthField, { AuthError } from "./AuthField";

export default function Login() {
  const { login } = useAuth();
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (event) => {
    event.preventDefault();
    setErr("");
    setLoading(true);
    try {
      await login(usernameOrEmail, password, remember);
    } catch (error) {
      setErr(
        error?.response?.data?.detail ||
        error.message ||
        "Login failed. Please check your credentials."
      );
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      mode="login"
      title="Welcome back."
      subtitle="Log in to pick up where you left off and find your next opportunity."
    >
      <form
        className="tm-auth-form"
        onSubmit={handleLogin}
        aria-busy={loading}
        aria-describedby={err ? "auth-error" : undefined}
      >
        <AuthField
          id="login-username"
          name="username"
          label="Username or email"
          icon={FiUser}
          placeholder="Enter your username or email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          value={usernameOrEmail}
          onChange={(event) => setUsernameOrEmail(event.target.value)}
          disabled={loading}
          required
        />
        <AuthField
          id="login-password"
          name="password"
          label="Password"
          type="password"
          icon={FiLock}
          placeholder="Enter your password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={loading}
          required
        />
        <div className="tm-auth-options">
          <label className="tm-auth-remember">
            <input
              type="checkbox"
              name="remember"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
              disabled={loading}
            />
            Remember me
          </label>
          <Link to="/request-password-reset">Forgot password?</Link>
        </div>
        <AuthError error={err} />
        <button className="tm-auth-submit" type="submit" disabled={loading}>
          {loading ? "Logging in..." : "Log in"}
          {!loading && <FiArrowRight aria-hidden="true" />}
        </button>
      </form>
      <p className="tm-auth-switch">
        New to TalentMatch? <Link to="/signup">Create an account</Link>
      </p>
    </AuthLayout>
  );
}
