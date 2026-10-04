"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { identityApi } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!email.trim()) {
      setError("Email is required");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Please enter a valid email address");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await identityApi.forgotPassword(email.trim());
      setSuccess(true);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to send reset email";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-4 py-10">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <Image
            src="/logo.svg"
            alt="Spotibuds Logo"
            width={200}
            height={60}
            priority
            className="h-10 w-10"
          />
        </div>

        <Card className="w-full max-w-md animate-fade-in">
          <CardHeader className="text-center">
            <h1 className="text-2xl text-white">Check your email</h1>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
              <p className="text-green-400">
                If an account with that email exists, we&apos;ve sent you a password reset link.
              </p>
            </div>
            <p className="text-gray-400 text-sm">
              Check your inbox and spam folder. If the email does not arrive, request another link.
            </p>
            <div className="space-y-2">
              <Link
                href="/"
                className="flex min-h-11 w-full items-center justify-center rounded-lg border border-gray-600 text-sm font-semibold hover:bg-gray-700"
              >
                Back to sign in
              </Link>
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setSuccess(false);
                  setEmail("");
                }}
              >
                Try Different Email
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-4 py-10">
      {/* Logo */}
      <div className="flex items-center gap-3">
        <Image
          src="/logo.svg"
          alt="Spotibuds Logo"
          width={200}
          height={60}
          priority
          className="h-10 w-10"
        />
      </div>

      {/* Forgot Password Form */}
      <Card className="w-full max-w-md animate-fade-in">
        <CardHeader className="text-center">
          <h1 className="text-2xl text-white">Reset Password</h1>
          <p className="text-gray-400 mt-2">
            Enter your email address and we&apos;ll send you a link to reset your password.
          </p>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div
                role="alert"
                className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm"
              >
                {error}
              </div>
            )}

            <Input
              label="Email Address"
              autoComplete="email"
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={e => {
                setEmail(e.target.value);
                if (error) setError("");
              }}
              required
            />

            <Button type="submit" className="w-full" loading={loading} size="lg">
              {loading ? "Sending..." : "Send Reset Link"}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-gray-400">
              Remember your password?{" "}
              <Link
                href="/"
                className="text-purple-400 hover:text-purple-300 font-medium transition-colors"
              >
                Sign in
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
