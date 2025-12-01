import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { BASE_URL } from "./api";
import { useAuth } from "./AuthContext";

export default function ProfilePage() {
  const [tab, setTab] = useState("Posts");
  const [user, setUser] = useState(null);

  // NEW: trends state
  const [trends, setTrends] = useState([]);
  const [trendsLoading, setTrendsLoading] = useState(true);

  const navigate = useNavigate();
  const { user: authUser } = useAuth();

  // Helper: build a text query from a trend
  const getTrendQuery = (trend) => {
    const fromTitle = (trend?.title || "").trim();
    const fromTag = (trend?.tag || "").replace("#", "").trim();
    return fromTitle || fromTag || "career development";
  };

  // Helper: LinkedIn jobs search URL
  const buildLinkedInJobsUrl = (trend) => {
    const q = encodeURIComponent(getTrendQuery(trend));
    return `https://www.linkedin.com/jobs/search/?keywords=${q}`;
  };

  // Helper: Coursera search URL
  const buildCourseraUrl = (trend) => {
    const q = encodeURIComponent(getTrendQuery(trend));
    return `https://www.coursera.org/search?query=${q}`;
  };

  // Fetch user profile info from backend on mount
  useEffect(() => {
    const fetchUser = async () => {
      try {
        // Get JWT token from auth context or localStorage
        const token = authUser?.token || localStorage.getItem("token");
        const res = await axios.get(`${BASE_URL}/me/`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        // Build display name from first + last; fall back to username
        const displayName =
          [res.data.first_name, res.data.last_name].filter(Boolean).join(" ").trim() ||
          res.data.username;

        setUser({
          avatar: res.data.profile_image_url,
          name: displayName,
          nickname: "@" + res.data.username,
          stats: { posts: 289, followers: "Lorem", following: "45 Ipsum" }, // You can make this dynamic if you have endpoints
        });
      } catch (err) {
        setUser({
          avatar: "https://randomuser.me/api/portraits/men/4.jpg",
          name: "Unknown User",
          nickname: "@unknown",
          stats: { posts: 0, followers: "0", following: "0" },
        });
      }
    };
    fetchUser();
  }, [authUser]);

  // NEW: Fetch personalized trends for the user
  useEffect(() => {
    const fetchTrends = async () => {
      try {
        const token = authUser?.token || localStorage.getItem("token");
        if (!token) {
          setTrends([]);
          return;
        }
        const res = await axios.get(`${BASE_URL}/profile/trends/`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setTrends(res.data.trends || []);
      } catch (err) {
        console.error("Failed to load trends", err);
        setTrends([]);
      } finally {
        setTrendsLoading(false);
      }
    };
    fetchTrends();
  }, [authUser]);

  // Sample posts remain static for now
  const samplePosts = [
    {
      id: 1,
      author: "Jane Doe",
      nickname: "@Nickname",
      time: "30 minutes ago",
      content:
        "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam.",
      replies: 163,
      retweets: "3.3K",
      likes: "14.7K",
      image: null,
    },
    {
      id: 2,
      author: "John Doe",
      nickname: "@Nickname",
      time: "30 minutes ago",
      content:
        "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam.",
      replies: 80,
      retweets: 500,
      likes: 2010,
      image: "https://via.placeholder.com/400x150/7dcfff/fff?text=Post+Image",
    },
  ];

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center w-full bg-gradient-to-br from-blue-100 to-purple-200 py-10 min-h-[90vh]">
        <div className="text-xl text-gray-600">Loading profile...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center w-full bg-gradient-to-br from-blue-100 to-purple-200 py-10 min-h-[90vh]">
      <div className="min-h-screen bg-gray-50 flex justify-center px-2">
        <div className="w-full max-w-8xl flex flex-col lg:flex-row gap-6 mt-4 mb-4">
          {/* Left/main content */}
          <main className="flex-1 bg-white rounded-2xl shadow-md overflow-hidden">
            {/* Banner */}
            <div className="w-full h-40 bg-gradient-to-r from-blue-400 to-blue-200 relative">
              {/* Avatar */}
              <div className="absolute left-8 -bottom-12 flex items-end">
                <img
                  src={user.avatar}
                  alt="Avatar"
                  className="w-28 h-28 rounded-full border-4 border-white object-cover shadow-xl"
                />
              </div>
            </div>
            {/* Profile details */}
            <div className="pt-16 px-8 pb-2">
              <div className="flex justify-between items-center">
                <div>
                  <div className="font-extrabold text-2xl text-gray-900">{user.name}</div>
                  <div className="text-gray-500">{user.nickname}</div>
                  <div className="flex gap-8 mt-2 text-gray-600 text-sm font-medium">
                    <span>
                      {user.stats.posts} <span className="text-gray-400 font-normal">Posts</span>
                    </span>
                    <span>
                      {user.stats.followers} <span className="text-gray-400 font-normal">Followers</span>
                    </span>
                    <span>
                      {user.stats.following} <span className="text-gray-400 font-normal">Following</span>
                    </span>
                  </div>
                </div>
                <button
                  className="border border-blue-400 text-blue-500 hover:bg-blue-100 font-semibold px-6 py-2 rounded-3xl transition"
                  onClick={() => navigate("/profile/settings")}
                >
                  Profile settings
                </button>
              </div>
              {/* Tabs */}
              <div className="flex gap-6 border-b border-gray-200 mt-8">
                {["Posts", "Replies", "Media", "Likes"].map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={
                      "py-3 font-semibold transition border-b-2 " +
                      (tab === t
                        ? "border-blue-500 text-blue-600"
                        : "border-transparent text-gray-500 hover:text-blue-400")
                    }
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            {/* Feed */}
            <div className="px-8 py-5">
              {/* Posts */}
              {samplePosts.map((p) => (
                <div key={p.id} className="border-b border-gray-100 pb-6 mb-6 flex gap-4">
                  <img src={user.avatar} alt="avatar" className="w-12 h-12 rounded-full object-cover" />
                  <div className="flex-1">
                    <div className="flex gap-2 items-baseline">
                      <span className="font-bold text-gray-800">{p.author}</span>
                      <span className="text-gray-400 text-sm">{p.nickname}</span>
                      <span className="text-gray-400 text-xs ml-2">{p.time}</span>
                    </div>
                    <div className="text-gray-800 mt-1 mb-2">{p.content}</div>
                    {p.image && (
                      <img src={p.image} alt="media" className="rounded-lg w-full max-w-xl my-2" />
                    )}
                    <div className="flex gap-7 text-gray-500 mt-2 text-sm font-medium">
                      <span>💬 {p.replies}</span>
                      <span>🔁 {p.retweets}</span>
                      <span>❤️ {p.likes}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </main>
          {/* Right Sidebar */}
          <aside className="w-full lg:w-96 flex-shrink-0">
            <div className="bg-white rounded-2xl shadow-md mb-6 p-5">
              <input
                type="text"
                className="w-full rounded-xl border border-gray-200 px-4 py-2 mb-3 focus:ring-2 focus:ring-blue-100"
                placeholder="🔍  Search ..."
              />
              <div className="font-bold mb-3 text-gray-800">Hot topics</div>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <img src={user.avatar} className="w-7 h-7 rounded-full" alt="" />
                  <div>
                    <div className="font-semibold text-sm text-gray-800">Jane Doe</div>
                    <div className="text-xs text-gray-500">@Nickname</div>
                  </div>
                  <button className="ml-auto px-3 py-1 rounded-2xl bg-blue-100 text-blue-600 font-bold text-xs">
                    Read
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <img src={user.avatar} className="w-7 h-7 rounded-full" alt="" />
                  <div>
                    <div className="font-semibold text-sm text-gray-800">John Doe</div>
                    <div className="text-xs text-gray-500">@Nickname</div>
                  </div>
                  <button className="ml-auto px-3 py-1 rounded-2xl bg-blue-100 text-blue-600 font-bold text-xs">
                    Read
                  </button>
                </div>
                <button className="text-blue-500 text-xs mt-2 ml-2">Show more...</button>
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-md p-5">
              <div className="font-bold mb-2 text-gray-800">Trends for you</div>

              {trendsLoading ? (
                <div className="text-xs text-gray-400">Loading personalized trends...</div>
              ) : trends && trends.length > 0 ? (
                <ol className="text-gray-700 text-sm space-y-3">
                  {trends.map((trend, idx) => (
                    <li key={idx} className="flex flex-col">
                      <div className="flex items-center gap-2">
                        {/* Hashtag → LinkedIn jobs */}
                        <a
                          href={buildLinkedInJobsUrl(trend)}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-blue-600 hover:underline"
                          title="View related jobs on LinkedIn"
                        >
                          {trend.tag || `#${trend.type || "topic"}`}
                        </a>
                        {/* Type pill → Coursera search */}
                        {trend.type && (
                          <a
                            href={buildCourseraUrl(trend)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[10px] uppercase tracking-wide text-gray-400 border border-gray-200 rounded-full px-2 py-[2px] hover:bg-blue-50 hover:text-blue-600 transition"
                            title="View related courses on Coursera"
                          >
                            {trend.type}
                          </a>
                        )}
                      </div>
                      <div className="text-sm font-semibold text-gray-900">
                        {trend.title}
                      </div>
                      <div className="text-xs text-gray-500">
                        {trend.subtitle}
                      </div>
                      {trend.url && (
                        <a
                          href={trend.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-blue-500 mt-1 hover:underline"
                        >
                          Learn more →
                        </a>
                      )}
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="text-xs text-gray-400">
                  No personalized trends yet. Try updating your profession and bio in your profile settings.
                </div>
              )}

              {/* Keep this button for consistency with your original UI */}
              <button className="text-blue-500 text-xs mt-3 ml-2">Show more...</button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
