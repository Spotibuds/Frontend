"use client";
import { useCallback, useState } from "react";
import { useDeferredEffect } from "@/hooks/useDeferredEffect";
import AdminNavigation from "@/components/AdminNavigation";
import { Input } from "@/components/ui/Input";
import { adminApi, apiRequest, API_CONFIG, identityApi, type UserAdmin } from "@/lib/api";

export default function AccountAdminManager({
  administrators = false,
}: {
  administrators?: boolean;
}) {
  const [records, setRecords] = useState<UserAdmin[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await apiRequest<{
        users: Array<{
          id: string;
          username: string;
          email: string;
          isPrivate: boolean;
          roles: string[];
        }>;
        totalCount: number;
      }>(
        `${API_CONFIG.IDENTITY_API}/api/auth/${administrators ? "admins" : "users"}?page=${page}&pageSize=12`
      );
      const actor = identityApi.getCurrentUser()?.id;
      setRecords(
        result.users
          .filter(user => user.id !== actor)
          .map(user => ({ ...user, userName: user.username }))
      );
      setTotal(result.totalCount);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Accounts could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [administrators, page]);
  useDeferredEffect(() => {
    void load();
  }, [load]);
  const mutate = async (operation: () => Promise<unknown>, success: string) => {
    if (pending) return false;
    setPending(true);
    setError("");
    setNotice("");
    try {
      await operation();
      setNotice(success);
      await load();
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Account change failed. Your input was kept."
      );
      return false;
    } finally {
      setPending(false);
    }
  };
  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (
      await mutate(
        () =>
          administrators
            ? adminApi.createAdmin({ userName: username, email, password })
            : adminApi.createUser({ userName: username, email, password }),
        "Account created."
      )
    ) {
      setUsername("");
      setEmail("");
      setPassword("");
    }
  };
  return (
    <>
      <AdminNavigation />
      <main className="p-4 sm:p-8 space-y-6 text-white">
        <h1 className="text-3xl font-semibold text-white">
          {administrators ? "Administrators" : "Users"}
        </h1>
        {error && (
          <p role="alert" className="text-red-300">
            {error}{" "}
            <button className="underline" onClick={() => void load()}>
              Retry loading
            </button>
          </p>
        )}
        {notice && (
          <p role="status" className="text-green-300">
            {notice}
          </p>
        )}
        <form
          onSubmit={create}
          className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 bg-gray-900 p-5 rounded-xl items-end"
        >
          <Input
            label="Username"
            autoComplete="off"
            value={username}
            onChange={event => setUsername(event.target.value)}
            minLength={3}
            maxLength={50}
            required
          />
          <Input
            label="Email"
            type="email"
            autoComplete="off"
            value={email}
            onChange={event => setEmail(event.target.value)}
            maxLength={100}
            required
          />
          <Input
            label="Password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={event => setPassword(event.target.value)}
            minLength={8}
            maxLength={100}
            required
          />
          <button
            disabled={pending}
            className="rounded min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-purple-300 disabled:opacity-50"
          >
            {pending ? "Saving…" : `Create ${administrators ? "administrator" : "user"}`}
          </button>
        </form>
        <p className="text-gray-400">
          Passwords need 8–100 characters, upper and lower case, a number, a symbol, and 6 distinct
          characters. Email changes require verification and are unavailable in this local demo.
        </p>
        {loading ? (
          <p role="status">Loading accounts…</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {records.map(user => (
              <article key={user.id} className="bg-gray-900 rounded-xl p-5 space-y-3">
                <h2 className="font-semibold">{user.userName}</h2>
                <p className="text-gray-400 break-all">{user.email}</p>
                <p>{user.isPrivate ? "Private profile" : "Public profile"}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    disabled={pending}
                    className="bg-gray-700 rounded p-2"
                    onClick={() =>
                      void mutate(
                        () =>
                          apiRequest(`${API_CONFIG.IDENTITY_API}/api/auth/users/${user.id}`, {
                            method: "PUT",
                            body: JSON.stringify({ isPrivate: !user.isPrivate }),
                          }),
                        "Privacy updated."
                      )
                    }
                  >
                    {user.isPrivate ? "Make public" : "Make private"}
                  </button>
                  <button
                    disabled={pending}
                    className="min-h-11 rounded-lg bg-primary p-2 text-primary-foreground hover:bg-purple-300"
                    onClick={() => {
                      if (confirm(`Change the role of ${user.userName}?`))
                        void mutate(
                          () =>
                            administrators
                              ? adminApi.demoteToUser({ id: user.id })
                              : adminApi.promoteUserToAdmin({ id: user.id }),
                          "Role updated."
                        );
                    }}
                  >
                    {administrators ? "Demote to user" : "Promote to admin"}
                  </button>
                  <button
                    disabled={pending}
                    className="bg-red-800 rounded p-2"
                    onClick={() => {
                      if (confirm(`Delete ${user.userName}? This cannot be undone.`))
                        void mutate(() => adminApi.deleteUser(user.id), "Account deleted.");
                    }}
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
        {!loading && !error && records.length === 0 && <p>No other accounts on this page.</p>}
        <nav aria-label="Account pages" className="flex gap-4 items-center">
          <button disabled={page === 1 || loading} onClick={() => setPage(page - 1)}>
            Previous
          </button>
          <span>
            Page {page} of {Math.max(1, Math.ceil(total / 12))}
          </span>
          <button disabled={page * 12 >= total || loading} onClick={() => setPage(page + 1)}>
            Next
          </button>
        </nav>
      </main>
    </>
  );
}
