"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import SidebarNavigation from "@/components/AdminNavigation";
import { adminApi, type User } from "@/lib/api";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";

const MySwal = withReactContent(Swal);

export default function AdminPageAdmins() {
  const [admins, setAdmins] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // For creating new admin
  const [newAdminUsername, setNewAdminUsername] = useState("");
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newAdminPassword, setNewAdminPassword] = useState("");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const adminsPerPage = 6;

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

  const totalPages = Math.ceil(admins.length / adminsPerPage);
  const indexOfLast = currentPage * adminsPerPage;
  const indexOfFirst = indexOfLast - adminsPerPage;
  const currentAdmins = admins.slice(indexOfFirst, indexOfLast);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) setCurrentPage(page);
  };

  // Create admin
  const handleCreate = async () => {
    if (!newAdminUsername || !newAdminEmail || !newAdminPassword) {
      MySwal.fire({
        icon: "warning",
        title: "All fields are required",
      });
      return;
    }

    const created = await adminApi.createAdmin({
      userName: newAdminUsername,
      email: newAdminEmail,
      password: newAdminPassword,
    });

    if (created) {
      await fetchAdmins();
      setNewAdminUsername("");
      setNewAdminEmail("");
      setNewAdminPassword("");

      MySwal.fire({
        icon: "success",
        title: "Admin created successfully",
      });
    } else {
      MySwal.fire({
        icon: "error",
        title: "Failed to create admin",
      });
    }
  };

  // Delete admin
  const handleDelete = async (id: string) => {
    const result = await MySwal.fire({
      title: "Are you sure?",
      text: "This action cannot be undone!",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete it!",
      cancelButtonText: "Cancel",
    });

    if (result.isConfirmed) {
      const success = await adminApi.deleteUser(id);
      if (success) {
        await fetchAdmins();
        MySwal.fire({
          icon: "success",
          title: "Admin deleted successfully",
        });
      } else {
        MySwal.fire({
          icon: "error",
          title: "Failed to delete admin",
        });
      }
    }
  };

  // Demote admin to user
  const handleDemote = async (id: string) => {
    const result = await MySwal.fire({
      title: "Demote Admin?",
      text: "This admin will become a regular user.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, demote",
      cancelButtonText: "Cancel",
    });

    if (result.isConfirmed) {
      const success = await adminApi.demoteToUser({id}); 
      if (success) {
        await fetchAdmins();
        MySwal.fire({
          icon: "success",
          title: "Admin demoted to user successfully",
        });
      } else {
        MySwal.fire({
          icon: "error",
          title: "Failed to demote admin",
        });
      }
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
        <div className="mb-6 flex flex-col sm:flex-row gap-2">
          <input
            className="p-2 rounded border border-purple-400 bg-black text-white flex-1 w-full"
            placeholder="Username"
            value={newAdminUsername}
            onChange={(e) => setNewAdminUsername(e.target.value)}
          />
          <input
            className="p-2 rounded border border-purple-400 bg-black text-white flex-1 w-full"
            placeholder="Email"
            value={newAdminEmail}
            onChange={(e) => setNewAdminEmail(e.target.value)}
          />
          <input
            className="p-2 rounded border border-purple-400 bg-black text-white flex-1 w-full"
            placeholder="Password"
            type="password"
            value={newAdminPassword}
            onChange={(e) => setNewAdminPassword(e.target.value)}
          />
          <button
            onClick={handleCreate}
            className="bg-purple-500 hover:bg-purple-600 px-4 py-2 rounded font-semibold w-full sm:w-auto"
          >
            Create Admin
          </button>
        </div>

        {/* Admins Cards */}
        {loading ? (
          <p>Loading admins...</p>
        ) : admins.length === 0 ? (
          <p>No admins found.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {currentAdmins.map((admin) => (
                <div
                  key={admin.id}
                  className="bg-gray-900 p-4 rounded shadow flex flex-col gap-2"
                >
                  <p className="font-semibold">{admin.userName}</p>
                  <p className="text-gray-400">{admin.email}</p>
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => handleDemote(admin.id)}
                      className="bg-yellow-600 hover:bg-yellow-700 px-2 py-1 rounded text-white"
                    >
                      Demote to User
                    </button>
                    <button
                      onClick={() => handleDelete(admin.id)}
                      className="bg-red-600 hover:bg-red-700 px-2 py-1 rounded text-white"
                    >
                      Delete
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
