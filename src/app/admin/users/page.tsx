"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import SidebarNavigation from "@/components/AdminNavigation";
import { adminApi, type User } from "@/lib/api";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";

const MySwal = withReactContent(Swal);

export default function UserPageUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const [newUsername, setNewUsername] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const usersPerPage = 6;

  const fetchUsers = async () => {
    setLoading(true);
    const data = await adminApi.getAllUsers();

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

  const totalPages = Math.ceil(users.length / usersPerPage);
  const indexOfLast = currentPage * usersPerPage;
  const indexOfFirst = indexOfLast - usersPerPage;
  const currentUsers = users.slice(indexOfFirst, indexOfLast);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) setCurrentPage(page);
  };

  const handleCreate = async () => {
    if (!newUsername || !newEmail || !newPassword) {
      MySwal.fire({ icon: "warning", title: "Please fill all fields" });
      return;
    }
    const created = await adminApi.createUser({
      userName: newUsername,
      email: newEmail,
      password: newPassword,
    });
    if (created) {
      await fetchUsers();
      setNewUsername("");
      setNewEmail("");
      setNewPassword("");
      MySwal.fire({ icon: "success", title: "User created successfully" });
    } else {
      MySwal.fire({ icon: "error", title: "Failed to create user" });
    }
  };

  const handleDelete = async (id: string) => {
    const result = await MySwal.fire({
      title: "Are you sure?",
      text: "This action cannot be undone.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });
    if (!result.isConfirmed) return;

    const success = await adminApi.deleteUser(id);
    if (success) {
      await fetchUsers();
      MySwal.fire({ icon: "success", title: "User deleted successfully" });
    } else {
      MySwal.fire({ icon: "error", title: "Failed to delete user" });
    }
  };

  const handlePromoteToAdmin = async (id: string) => {
    const result = await MySwal.fire({
      title: "Promote to Admin?",
      text: "This user will gain admin privileges.",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Yes, promote",
      cancelButtonText: "Cancel",
    });

    if (!result.isConfirmed) return;

    const success = await adminApi.promoteUserToAdmin({ id });
    if (success) {
      await fetchUsers();
      MySwal.fire({ icon: "success", title: "User promoted to admin" });
    } else {
      MySwal.fire({ icon: "error", title: "Failed to promote user" });
    }
  };

  return (
    <AppLayout>
      <SidebarNavigation />
      <main className="p-6 bg-black min-h-screen text-white">
        <h1 className="text-3xl font-bold text-purple-400 mb-6">Users Dashboard</h1>

        {/* Create User */}
        <div className="mb-6 flex flex-col sm:flex-row gap-2">
          <input
            className="p-2 rounded border border-purple-400 bg-black text-white flex-1"
            placeholder="Username"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
          />
          <input
            className="p-2 rounded border border-purple-400 bg-black text-white flex-1"
            placeholder="Email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
          />
          <input
            className="p-2 rounded border border-purple-400 bg-black text-white flex-1"
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

        {/* Users Cards */}
        {loading ? (
          <p>Loading users...</p>
        ) : users.length === 0 ? (
          <p>No users found.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {currentUsers.map((user) => (
                <div key={user.id} className="bg-gray-900 p-4 rounded shadow flex flex-col gap-2">
                  <p className="font-semibold">{user.userName}</p>
                  <p className="text-gray-400">{user.email}</p>
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => handleDelete(user.id)}
                      className="bg-red-600 hover:bg-red-700 px-2 py-1 rounded text-white flex-1"
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => handlePromoteToAdmin(user.id)}
                      className="bg-green-600 hover:bg-green-700 px-2 py-1 rounded text-white flex-1"
                    >
                      Make Admin
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            <div className="flex justify-center items-center mt-6 gap-4 flex-wrap">
              <button
                disabled={currentPage === 1}
                onClick={() => handlePageChange(currentPage - 1)}
                className="px-4 py-2 bg-gray-700 text-white rounded disabled:opacity-50"
              >
                Prev
              </button>
              <span className="text-white">
                Page {currentPage} of {totalPages}
              </span>
              <button
                disabled={currentPage === totalPages}
                onClick={() => handlePageChange(currentPage + 1)}
                className="px-4 py-2 bg-gray-700 text-white rounded disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </>
        )}
      </main>
    </AppLayout>
  );
}
