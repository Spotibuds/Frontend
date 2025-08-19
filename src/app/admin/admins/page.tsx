"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import SidebarNavigation from "@/components/AdminNavigation";
import { adminApi, type User } from "@/lib/api";

export default function AdminPageAdmins() {
  const [admins, setAdmins] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<User | null>(null);

  // For creating new admin
  const [newAdminUsername, setNewAdminUsername] = useState("");
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newAdminPassword, setNewAdminPassword] = useState("");

  // For updating admin
  const [editUsername, setEditUsername] = useState("");
  const [editEmail, setEditEmail] = useState("");

  const fetchAdmins = async () => {
    setLoading(true);
    const data = await adminApi.getAllAdmins();
    setAdmins(data);
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

  // Open edit modal
  const openEditModal = (admin: User) => {
    setEditingAdmin(admin);
    setEditUsername(admin.userName);
    setEditEmail(admin.email || "");
    setModalOpen(true);
  };

  // Update admin
  const handleUpdate = async () => {
    if (!editingAdmin) return;
    const updated = await adminApi.updateUser(editingAdmin.id, {
      userName: editUsername,
      email: editEmail,
    });
    if (updated) {
      fetchAdmins();
      setModalOpen(false);
      setEditingAdmin(null);
    }
  };

  return (
    <AppLayout>
      <SidebarNavigation />
      <main className="p-6 bg-black min-h-screen text-white">
        <h1 className="text-3xl font-bold text-purple-400 mb-6">Admins Dashboard</h1>

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
                <th className="border p-2">ID</th>
                <th className="border p-2">Username</th>
                <th className="border p-2">Email</th>
                <th className="border p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {admins.map((admin) => (
                <tr key={admin.id} className="hover:bg-gray-900">
                  <td className="border p-2">{admin.id}</td>
                  <td className="border p-2">{admin.userName}</td>
                  <td className="border p-2">{admin.email}</td>
                  <td className="border p-2 flex gap-2">
                    <button
                      onClick={() => openEditModal(admin)}
                      className="bg-purple-500 hover:bg-purple-600 px-2 py-1 rounded text-white"
                    >
                      Edit
                    </button>
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

        {/* Edit Modal */}
        {modalOpen && editingAdmin && (
          <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
            <div className="bg-black border border-purple-400 rounded p-6 w-96 text-white">
              <h2 className="text-xl font-bold mb-4 text-purple-400">Edit Admin</h2>
              <input
                className="p-2 rounded border border-purple-400 w-full mb-3 bg-black text-white"
                placeholder="Username"
                value={editUsername}
                onChange={(e) => setEditUsername(e.target.value)}
              />
              <input
                className="p-2 rounded border border-purple-400 w-full mb-3 bg-black text-white"
                placeholder="Email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setModalOpen(false)}
                  className="bg-gray-700 hover:bg-gray-800 px-3 py-1 rounded"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdate}
                  className="bg-purple-500 hover:bg-purple-600 px-3 py-1 rounded"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </AppLayout>
  );
}
