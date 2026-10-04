"use client";

import { Suspense, useState } from "react";

import { useSearchParams } from "next/navigation";

import Link from "next/link";

import { Input } from "@/components/ui/Input";

import { Button } from "@/components/ui/Button";

import { Card, CardContent, CardHeader } from "@/components/ui/Card";

import { identityApi } from "@/lib/api";

function ResetPasswordForm() {
  const params = useSearchParams();

  const email = params.get("email") || "";

  const token = params.get("token") || "";

  const [password, setPassword] = useState("");

  const [confirmation, setConfirmation] = useState("");

  const [error, setError] = useState("");

  const [success, setSuccess] = useState(false);

  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    if (!email || !token) {
      setError("This reset link is incomplete. Request a new link.");
      return;
    }

    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }

    if (
      password.length < 8 ||
      password.length > 100 ||
      new Set(password).size < 6 ||
      !/[A-Z]/.test(password) ||
      !/[a-z]/.test(password) ||
      !/[0-9]/.test(password) ||
      !/[^a-zA-Z0-9]/.test(password)
    ) {
      setError(
        "Use 8–100 characters with uppercase, lowercase, a number, a symbol and six unique characters."
      );
      return;
    }

    setSaving(true);

    try {
      await identityApi.resetPassword(email, token, password);
      setSuccess(true);
      window.history.replaceState(null, "", "/reset-password");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Reset failed. Request a new link and try again."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <h1 className="text-2xl font-semibold">Choose a new password</h1>
        </CardHeader>
        <CardContent>
          {success ? (
            <p role="status">
              Password updated. Your previous sessions were revoked.{" "}
              <Link className="text-purple-300" href="/">
                Sign in
              </Link>
            </p>
          ) : !email || !token ? (
            <p role="alert">
              This reset link is incomplete.{" "}
              <Link className="text-purple-300 underline" href="/forgot-password">
                Request a new link
              </Link>
              .
            </p>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              {error && (
                <p role="alert" className="text-red-300">
                  {error}
                </p>
              )}

              <Input
                label="New password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                required
                maxLength={100}
              />

              <p className="text-xs text-gray-400">
                Use 8–100 characters with uppercase, lowercase, a number, a symbol and six unique
                characters.
              </p>
              <Input
                label="Confirm new password"
                type="password"
                autoComplete="new-password"
                value={confirmation}
                onChange={event => setConfirmation(event.target.value)}
                required
                maxLength={100}
              />

              <Button type="submit" loading={saving}>
                Reset password
              </Button>
              <Link className="block text-purple-300" href="/forgot-password">
                Request another reset link
              </Link>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<p role="status">Loading reset form…</p>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
