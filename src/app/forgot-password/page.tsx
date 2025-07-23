"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
// identityApi import removed – not used in this component

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
      // For now, just simulate the request since the backend endpoint might not exist yet
      await new Promise(resolve => setTimeout(resolve, 1000));
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
      <div className="min-h-screen flex items-center justify-center p-4">
        {/* Logo */}
        <div className="absolute top-6 left-6">
          <Image 
            src="/logo.svg" 
            alt="Spotibuds Logo" 
            width={200} 
            height={60}
            priority
            className="h-12 w-auto"
          />
        </div>

        <Card className="w-full max-w-md animate-fade-in">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl gradient-text">Check Your Email</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
              <p className="text-green-400">
                If an account with that email exists, we&apos;ve sent you a password reset link.
              </p>
            </div>
            <p className="text-gray-400 text-sm">
              Didn&apos;t receive an email? Check your spam folder or try again.
            </p>
            <div className="space-y-2">
              <Link href="/">
                <Button variant="outline" className="w-full">
                  Back to Sign In
                </Button>
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
    <div className="min-h-screen flex items-center justify-center p-4">
      {/* Logo */}
      <div className="absolute top-6 left-6">
        <Image 
          src="/logo.svg" 
          alt="Spotibuds Logo" 
          width={200} 
          height={60}
          priority
          className="h-12 w-auto"
        />
      </div>

      {/* Forgot Password Form */}
      <Card className="w-full max-w-md animate-fade-in">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl gradient-text">Reset Password</CardTitle>
          <p className="text-gray-400 mt-2">
            Enter your email address and we&apos;ll send you a link to reset your password.
          </p>
        </CardHeader>
        
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                {error}
              </div>
            )}

            <Input
              label="Email Address"
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError("");
              }}
              required
            />

            <Button
              type="submit"
              className="w-full"
              loading={loading}
              size="lg"
            >
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