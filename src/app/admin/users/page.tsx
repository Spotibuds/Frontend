"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import SidebarNavigation from "@/components/AdminNavigation";
import { adminApi, type User } from "@/lib/api";

export default function UserPageUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalData, setModalData] = useState<{
    id?: string;
    userName: string;
    email: string;
    password?: string;
  }>({ userName: "", email: "" });

  const [isEditing, setIsEditing] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    const data = await adminApi.getAllUsers();
    setUsers(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // Open modal for creating new user
  const openCreateModal = () => {
    setModalData({ userName: "", email: "", password: "" });
    setIsEditing(false);
    setModalOpen(true);
  };

  // Open modal for editing existing user
  const openEditModal = (user: User) => {
    setModalData({ id: user.id, userName: user.userName, email: user.email || "" });
    setIsEditing(true);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (isEditing) {
      if (!modalData.id || !modalData.userName || !modalData.email) return;
      const updated = await adminApi.updateUser(modalData.id, {
        userName: modalData.userName,
        email: modalData.email,
      });
      if (updated) {
        fetchUsers();
        setModalOpen(false);
      }
    } else {
      if (!modalData.userName || !modalData.email || !modalData.password) return;
      const created = await adminApi.createUser({
        userName: modalData.userName,
        email: modalData.email,
        password: modalData.password,
      });
      if (created) {
        fetchUsers();
        setModalOpen(false);
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this user?")) {
      const success = await adminApi.deleteUser(id);
      if (success) fetchUsers();
    }
  };

  return (
    <AppLayout>
      <SidebarNavigation />
      <main className="p-6 bg-black min-h-screen text-white">
        <h1 className="text-3xl font-bold text-purple-400 mb-6">Users Dashboard</h1>

        <button
          onClick={openCreateModal}
          className="mb-4 bg-purple-500 hover:bg-purple-600 px-4 py-2 rounded font-semibold"
        >
          Create New User
        </button>

        {/* Users Table */}
        {loading ? (
          <p>Loading users...</p>
        ) : users.length === 0 ? (
          <p>No users found.</p>
        ) : (
          <table className="w-full border-collapse border border-purple-400">
            <thead className="bg-purple-700">
              <tr>
                <th className="border p-2">ID</th>
                <th className="border p-2">Username</th>
                <th className="border p-2">Email</th>
                <th className="border p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-900">
                  <td className="border p-2">{user.id}</td>
                  <td className="border p-2">{user.userName}</td>
                  <td className="border p-2">{user.email}</td>
                  <td className="border p-2 flex gap-2">
                    <button
                      onClick={() => openEditModal(user)}
                      className="bg-purple-500 hover:bg-purple-600 px-2 py-1 rounded text-white"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(user.id)}
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

        {/* Modal */}
        {modalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
            <div className="bg-black border border-purple-400 rounded p-6 w-96 text-white">
              <h2 className="text-xl font-bold mb-4 text-purple-400">
                {isEditing ? "Edit User" : "Create User"}
              </h2>

              <input
                className="p-2 rounded border border-purple-400 w-full mb-3 bg-black text-white"
                placeholder="Username"
                value={modalData.userName}
                onChange={(e) =>
                  setModalData((prev) => ({ ...prev, userName: e.target.value }))
                }
              />
              <input
                className="p-2 rounded border border-purple-400 w-full mb-3 bg-black text-white"
                placeholder="Email"
                value={modalData.email}
                onChange={(e) =>
                  setModalData((prev) => ({ ...prev, email: e.target.value }))
                }
              />
              {!isEditing && (
                <input
                  className="p-2 rounded border border-purple-400 w-full mb-3 bg-black text-white"
                  placeholder="Password"
                  type="password"
                  value={modalData.password || ""}
                  onChange={(e) =>
                    setModalData((prev) => ({ ...prev, password: e.target.value }))
                  }
                />
              )}

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setModalOpen(false)}
                  className="bg-gray-700 hover:bg-gray-800 px-3 py-1 rounded"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="bg-purple-500 hover:bg-purple-600 px-3 py-1 rounded"
                >
                  {isEditing ? "Save" : "Create"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </AppLayout>
  );
}
