import React, { createContext, useContext, useState, useEffect } from "react";
import axios from "axios";
import { BASE_URL } from "./api";

// Create a context to manage authentication state and actions.
const AuthContext = createContext();

// Custom hook to access the authentication context.
export function useAuth() {
    return useContext(AuthContext);
}

// NEW: Helper to check if a JWT access token is expired.
// We decode the middle part of the token (payload), read the `exp` claim,
// and compare it with the current time.
function isTokenExpired(token) {
    if (!token) return true;
    try {
        const [, payload] = token.split(".");
        const decoded = JSON.parse(window.atob(payload));
        if (!decoded.exp) return false; // if token has no exp we treat it as non-expiring
        const nowInSeconds = Date.now() / 1000;
        return decoded.exp < nowInSeconds;
    } catch (e) {
        // If anything goes wrong decoding, we assume the token is invalid/expired.
        return true;
    }
}

// Helper function to get auth data from storage (sessionStorage first, then localStorage).
function getStoredAuth() {
    // Try sessionStorage first
    let token = sessionStorage.getItem("token");
    let email = sessionStorage.getItem("email");
    let username = sessionStorage.getItem("username");
    // If not found in sessionStorage, try localStorage
    if (!token || !email || !username) {
        token = localStorage.getItem("token");
        email = localStorage.getItem("email");
        username = localStorage.getItem("username");
    }

    // NEW: If we have something in storage but the token is expired, clear it and return null.
    if (token && isTokenExpired(token)) {
        sessionStorage.removeItem("token");
        sessionStorage.removeItem("email");
        sessionStorage.removeItem("username");
        localStorage.removeItem("token");
        localStorage.removeItem("email");
        localStorage.removeItem("username");
        return null;
    }

    return token && email && username ? { token, email, username } : null;
}

// AuthProvider component to wrap the application and provide authentication context.
export function AuthProvider({ children }) {
    // Initialize the user state by checking sessionStorage, then localStorage for existing authentication data.
    const [user, setUser] = useState(getStoredAuth);

    // NEW: Whenever `user` changes, set/unset the default Authorization header for axios.
    // This way every axios request automatically sends the JWT if we are logged in.
    useEffect(() => {
        if (user?.token) {
            axios.defaults.headers.common["Authorization"] = `Bearer ${user.token}`;
        } else {
            delete axios.defaults.headers.common["Authorization"];
        }
    }, [user]);

    // NEW: Global axios response interceptor.
    // If the backend returns 401 (token expired / invalid), we log the user out
    // and send them back to the login page.
    useEffect(() => {
        const interceptor = axios.interceptors.response.use(
            (response) => response,
            (error) => {
                if (error?.response?.status === 401) {
                    logout();
                    // Hard redirect so all state is reset.
                    window.location.href = "/";
                }
                return Promise.reject(error);
            }
        );
        return () => axios.interceptors.response.eject(interceptor);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Function to set authentication data and update the appropriate storage based on "remember me".
    const setAuthData = ({ token, email, username }, remember = false) => {
        // NEW: If the token is already expired when we receive it (shouldn't happen, but just in case),
        // immediately log out and do not store anything.
        if (isTokenExpired(token)) {
            logout();
            return;
        }

        if (remember) {
            // Save the JWT token, email, and username to localStorage.
            localStorage.setItem("token", token);
            localStorage.setItem("email", email);
            localStorage.setItem("username", username);
            sessionStorage.removeItem("token");
            sessionStorage.removeItem("email");
            sessionStorage.removeItem("username");
        } else {
            // Save the JWT token, email, and username to sessionStorage.
            sessionStorage.setItem("token", token);
            sessionStorage.setItem("email", email);
            sessionStorage.setItem("username", username);
            localStorage.removeItem("token");
            localStorage.removeItem("email");
            localStorage.removeItem("username");
        }
        setUser({ token, email, username }); // Update the user state with the new data.
    };

    // Function to perform the login API call and set authentication data on success.
    // Accepts an optional "remember" parameter to indicate storage preference.
    const performLogin = async (usernameOrEmail, password, remember = false) => {
        const params = new URLSearchParams();
        params.append("username", usernameOrEmail);
        params.append("password", password);
        params.append("grant_type", "password");
        params.append("remember", remember ? "true" : "false"); // <-- send remember to backend

        const res = await axios.post(`${BASE_URL}/login/`, params, {
            headers: { "Content-Type": "application/x-www-form-urlencoded" }, // Set the content type for the request.
        });
        // On successful login, save the returned token, email, and username to the appropriate storage and state.
        setAuthData(
            {
                token: res.data.access_token,
                email: res.data.email,
                username: res.data.username,
            },
            remember
        );
        return res.data;
    };

    // Function to log out the user by clearing authentication data from both storages and state.
    const logout = () => {
        localStorage.removeItem("token"); // Remove the JWT token from localStorage.
        localStorage.removeItem("email"); // Remove the user's email from localStorage.
        localStorage.removeItem("username"); // Remove the user's username from localStorage.
        sessionStorage.removeItem("token"); // Remove the JWT token from sessionStorage.
        sessionStorage.removeItem("email"); // Remove the user's email from sessionStorage.
        sessionStorage.removeItem("username"); // Remove the user's username from sessionStorage.
        setUser(null); // Reset the user state to null.
    };

    // Provide the authentication context to child components.
    return (
        <AuthContext.Provider value={{ user, login: performLogin, setAuthData, logout }}>
            {children}
        </AuthContext.Provider>
    );
}
