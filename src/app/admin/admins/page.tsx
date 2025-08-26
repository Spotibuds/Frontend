"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import SidebarNavigation from "@/components/AdminNavigation";
import { adminApi, type User } from "@/lib/api";

export default function AdminPageAdmins() {
  const [admins, setAdmins] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // For creating new admin
  const [newAdminUsername, setNewAdminUsername] = useState("");
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newAdminPassword, setNewAdminPassword] = useState("");

  const fetchAdmins = async () => {
    setLoading(true);
    const data = await adminApi.getAllAdmins();

    // Get current user from localStorage
    const currentUser = localStorage.getItem("currentUser");
    let currentUserId = "";
    if (currentUser) {
      try {
        const parsed = JSON.parse(currentUser);
        currentUserId = parsed.id;
      } catch (e) {
        console.error("Failed to parse currentUser from localStorage", e);
      }
    }

    // Filter out current user
    const filteredAdmins = data.filter((admin) => admin.id !== currentUserId);

    setAdmins(filteredAdmins);
    setLoading(false);
  };

  useEffect(() => {
    fetchAdmins();
  }, []);

  // Create admin
  const handleCreate = async () => {
    if (!newAdminUsername || !newAdminEmail || !newAdminPassword) return;
    const created = await adminApi.createAdmin({
      userName: newAdminUsername,
      email: newAdminEmail,
      password: newAdminPassword,
    });
    if (created) {
      fetchAdmins();
      setNewAdminUsername("");
      setNewAdminEmail("");
      setNewAdminPassword("");
    }
  };

  // Delete admin
  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this admin?")) {
      const success = await adminApi.deleteUser(id);
      if (success) fetchAdmins();
    }
  };

  return (
    <AppLayout>
      <SidebarNavigation />
      <main className="p-6 bg-black min-h-screen text-white">
        <h1 className="text-3xl font-bold text-purple-400 mb-6">
          Admins Dashboard
        </h1>

        {/* Create Admin */}
        <div className="mb-6 flex gap-2">
          <input
            className="p-2 rounded border border-purple-400 bg-black text-white"
            placeholder="Username"
            value={newAdminUsername}
            onChange={(e) => setNewAdminUsername(e.target.value)}
          />
          <input
            className="p-2 rounded border border-purple-400 bg-black text-white"
            placeholder="Email"
            value={newAdminEmail}
            onChange={(e) => setNewAdminEmail(e.target.value)}
          />
          <input
            className="p-2 rounded border border-purple-400 bg-black text-white"
            placeholder="Password"
            type="password"
            value={newAdminPassword}
            onChange={(e) => setNewAdminPassword(e.target.value)}
          />
          <button
            onClick={handleCreate}
            className="bg-purple-500 hover:bg-purple-600 px-4 py-2 rounded font-semibold"
          >
            Create Admin
          </button>
        </div>

        {/* Admins Table */}
        {loading ? (
          <p>Loading admins...</p>
        ) : admins.length === 0 ? (
          <p>No admins found.</p>
        ) : (
          <table className="w-full border-collapse border border-purple-400">
            <thead className="bg-purple-700">
              <tr>
                <th className="border p-2">Username</th>
                <th className="border p-2">Email</th>
                <th className="border p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {admins.map((admin) => (
                <tr key={admin.id} className="hover:bg-gray-900">
                  <td className="border p-2">{admin.userName}</td>
                  <td className="border p-2">{admin.email}</td>
                  <td className="border p-2">
                    <button
                      onClick={() => handleDelete(admin.id)}
                      className="bg-red-600 hover:bg-red-700 px-2 py-1 rounded text-white"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </AppLayout>
  );
}
