import React, { useState } from "react";
import axios from "axios";
import { BASE_URL } from "./api";
import { FiMail, FiLock, FiUser } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import PublicNavBar from "./PublicNavBar"; // Import the public navbar

// Signup component handles user registration functionality and UI.
export default function Signup({ onLogin, onSwitch }) {
  const [username, setUsername] = useState(""); // State to store the entered username.
  const [email, setEmail] = useState(""); // State to store the entered email.
  const [password, setPassword] = useState(""); // State to store the entered password.
  const [err, setErr] = useState(""); // State to store any error messages during signup.
  const [loading, setLoading] = useState(false); // State to indicate if the signup process is ongoing.

  // NEW: capture first/last name
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  const navigate = useNavigate(); // Hook to programmatically navigate after signup.

  // Function to handle the signup form submission.
  const handleSignup = async (e) => {
    e.preventDefault(); // Prevent the default form submission behavior.
    setErr(""); // Clear any previous error messages.
    setLoading(true); // Set the loading state to true while processing the signup.
    try {
      const params = new URLSearchParams(); // Create URL-encoded parameters for the signup request.
      params.append("username", username); // Add the username to the parameters.
      params.append("email", email); // Add the email to the parameters.
      params.append("password", password); // Add the password to the parameters.
      // NEW: include first_name and last_name
      params.append("first_name", firstName);
      params.append("last_name", lastName);

      // Send a POST request to the backend to register the user.
      await axios.post(`${BASE_URL}/register/`, params, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" }, // Set the content type for the request.
      });

      // After successful signup, log in automatically using the provided credentials.
      const loginParams = new URLSearchParams();
      loginParams.append("username", username); // Add the username to the login parameters.
      loginParams.append("password", password); // Add the password to the login parameters.
      loginParams.append("grant_type", "password"); // Specify the grant type for the OAuth2 flow.

      const res = await axios.post(`${BASE_URL}/login/`, loginParams, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" }, // Set the content type for the request.
      });

      onLogin(res.data); // Pass the login response data (e.g., token) to the parent component.
    } catch (error) {
      // If an error occurs, display an appropriate error message.
      setErr(
        error.response?.data?.detail || "Registration failed. Please try again."
      );
    } finally {
      setLoading(false); // Reset the loading state after the process is complete.
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-gradient-to-br from-purple-800 via-purple-500 to-blue-400 relative overflow-hidden">
      {/* Top navigation bar */}
      <PublicNavBar />

      {/* Centered signup card */}
      <div className="flex items-center justify-center w-full min-h-screen">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md px-8 py-10 mt-24 mb-10 relative z-20">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-gray-800">Sign Up</h2>
          </div>
          {/* Signup form */}
          <form className="space-y-5" onSubmit={handleSignup}>
            {/* Input field for username */}
            <div className="flex items-center border-b border-gray-200 py-2">
              <FiUser className="text-gray-400 mr-2" />
              <input
                type="text"
                placeholder="Username"
                className="w-full outline-none border-0 bg-transparent px-1 py-2 text-gray-700"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                autoFocus
              />
            </div>

            {/* NEW: Input field for first name */}
            <div className="flex items-center border-b border-gray-200 py-2">
              <FiUser className="text-gray-400 mr-2" />
              <input
                type="text"
                placeholder="First name"
                className="w-full outline-none border-0 bg-transparent px-1 py-2 text-gray-700"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                required
              />
            </div>

            {/* NEW: Input field for last name */}
            <div className="flex items-center border-b border-gray-200 py-2">
              <FiUser className="text-gray-400 mr-2" />
              <input
                type="text"
                placeholder="Last name"
                className="w-full outline-none border-0 bg-transparent px-1 py-2 text-gray-700"
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                required
              />
            </div>

            {/* Input field for email */}
            <div className="flex items-center border-b border-gray-200 py-2">
              <FiMail className="text-gray-400 mr-2" />
              <input
                type="email"
                placeholder="Email"
                className="w-full outline-none border-0 bg-transparent px-1 py-2 text-gray-700"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>
            {/* Input field for password */}
            <div className="flex items-center border-b border-gray-200 py-2">
              <FiLock className="text-gray-400 mr-2" />
              <input
                type="password"
                placeholder="Password"
                className="w-full outline-none border-0 bg-transparent px-1 py-2 text-gray-700"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>
            {/* Display error message if signup fails */}
            {err && <div className="text-red-500 text-sm">{err}</div>}
            {/* Submit button for signup */}
            <button
              type="submit"
              className="w-full mt-2 py-3 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold text-lg shadow transition"
              disabled={loading}
            >
              {loading ? "Signing up..." : "Sign Up"}
            </button>
          </form>
          {/* Option to switch to the login form */}
          <div className="text-center mt-5 text-gray-500 text-sm">
            Already have an account?{" "}
            <button onClick={() => navigate("/login")} className="text-purple-600 font-semibold hover:underline" type="button">
              Login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}