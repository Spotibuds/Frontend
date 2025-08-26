"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import SidebarNavigation from "@/components/AdminNavigation";
import { adminApi, type User } from "@/lib/api";

export default function UserPageUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // For creating new user
  const [newUsername, setNewUsername] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const fetchUsers = async () => {
        setLoading(true);
    const data = await adminApi.getAllUsers();

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

    const filteredUsers = data.filter((user) => user.id !== currentUserId);

    setUsers(filteredUsers);
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // Create user
  const handleCreate = async () => {
    if (!newUsername || !newEmail || !newPassword) return;
    const created = await adminApi.createUser({
      userName: newUsername,
      email: newEmail,
      password: newPassword,
    });
    if (created) {
      fetchUsers();
      setNewUsername("");
      setNewEmail("");
      setNewPassword("");
    }
  };

  // Delete user
  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this user?")) {
      const success = await adminApi.deleteUser(id);
      if (success) fetchUsers();
    }
  };

  // Promote user to admin
  const handlePromoteToAdmin = async (id: string) => {
    if (confirm("Are you sure you want to make this user an admin?")) {
      const success = await adminApi.promoteUserToAdmin({id});
      if (success) {
        alert("User promoted to admin successfully");
        fetchUsers();
      } else {
        alert("Failed to promote user");
      }
    }
  };

  return (
    <AppLayout>
      <SidebarNavigation />
      <main className="p-6 bg-black min-h-screen text-white">
        <h1 className="text-3xl font-bold text-purple-400 mb-6">
          Users Dashboard
        </h1>

        {/* Create User */}
        <div className="mb-6 flex gap-2">
          <input
            className="p-2 rounded border border-purple-400 bg-black text-white"
            placeholder="Username"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
          />
          <input
            className="p-2 rounded border border-purple-400 bg-black text-white"
            placeholder="Email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
          />
          <input
            className="p-2 rounded border border-purple-400 bg-black text-white"
            placeholder="Password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <button
            onClick={handleCreate}
            className="bg-purple-500 hover:bg-purple-600 px-4 py-2 rounded font-semibold"
          >
            Create User
          </button>
        </div>

        {/* Users Table */}
        {loading ? (
          <p>Loading users...</p>
        ) : users.length === 0 ? (
          <p>No users found.</p>
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
  {users.map((user) => (
    <tr key={user.id} className="hover:bg-gray-900">
      <td className="border p-2">{user.userName}</td>
      <td className="border p-2">{user.email}</td>
      <td className="border p-2 flex gap-2">
        <button
          onClick={() => handleDelete(user.id)}
          className="bg-red-600 hover:bg-red-700 px-2 py-1 rounded text-white"
        >
          Delete
        </button>
        <button
          onClick={() => handlePromoteToAdmin(user.id)}
          className="bg-green-600 hover:bg-green-700 px-2 py-1 rounded text-white"
        >
          Make Admin
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
