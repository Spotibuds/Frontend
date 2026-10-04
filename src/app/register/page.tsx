"use client";
import { useDeferredEffect } from "@/hooks/useDeferredEffect";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { ApiError } from "@/lib/request";
import { identityApi, type RegisterRequest } from "@/lib/api";

interface FormData extends RegisterRequest {
  confirmPassword: string;
  recaptchaToken: string | null;
}

export default function RegisterPage() {
  const [formData, setFormData] = useState<FormData>({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
    recaptchaToken: null,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [registrationPending, setRegistrationPending] = useState(false);
  const registered = useRef<{ username: string; password: string; confirmed: boolean } | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const router = useRouter();

  // Prevent hydration mismatches
  useDeferredEffect(() => {
    setIsMounted(true);
  }, []);

  // Component is ready for registration - no additional setup needed

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Username validation
    if (!formData.username.trim()) {
      newErrors.username = "Username is required";
    } else if (formData.username.length < 3) {
      newErrors.username = "Username must be at least 3 characters";
    }

    // Email validation
    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Please enter a valid email address";
    }

    // Password validation
    if (!formData.password) {
      newErrors.password = "Password is required";
    } else {
      if (formData.password.length < 8) {
        newErrors.password = "Password must be at least 8 characters";
      } else if (formData.password.length > 100) {
        newErrors.password = "Password must be no more than 100 characters";
      } else if (!/[0-9]/.test(formData.password)) {
        newErrors.password = "Password must contain at least one digit";
      } else if (!/[A-Z]/.test(formData.password)) {
        newErrors.password = "Password must contain at least one uppercase letter";
      } else if (!/[a-z]/.test(formData.password)) {
        newErrors.password = "Password must contain at least one lowercase letter";
      } else if (!/[^a-zA-Z0-9]/.test(formData.password)) {
        newErrors.password = "Password must contain at least one special character";
      }
    }

    // Confirm password validation
    if (!formData.confirmPassword) {
      newErrors.confirmPassword = "Please confirm your password";
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
    }

    if (new Set(formData.password).size < 6)
      newErrors.password = "Password must contain at least six unique characters";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!validateForm()) return;

    setLoading(true);
    setErrors({});

    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { confirmPassword, recaptchaToken, ...registerData } = formData;
      if (!registrationPending) {
        await identityApi.register(registerData);
        registered.current = {
          username: formData.username,
          password: formData.password,
          confirmed: true,
        };
        setRegistrationPending(true);
      }

      // Auto-login after successful registration
      await identityApi.login({
        username: registered.current?.username || formData.username,
        password: registered.current?.password || formData.password,
      });

      router.push("/dashboard");
    } catch (error) {
      if (registered.current?.confirmed) {
        setErrors({
          general: `Your account was created, but sign-in could not finish. ${error instanceof Error ? error.message : "Please retry."} Use Retry sign-in.`,
        });
        return;
      }
      if (error instanceof ApiError && error.status === 503) {
        registered.current = {
          username: formData.username,
          password: formData.password,
          confirmed: false,
        };
        setRegistrationPending(true);
        setErrors({
          general:
            "Your account may have been created while profile synchronization is pending. Keep these credentials and use Retry sign-in shortly; do not register again.",
        });
        return;
      }
      const errorMessage = error instanceof Error ? error.message : "Registration failed";

      // Try to parse the error message as JSON to get detailed errors
      let parsedError: { errors?: string[]; message?: string } | null = null;
      try {
        parsedError = JSON.parse(errorMessage) as { errors?: string[]; message?: string };
      } catch {
        // Not JSON, treat as plain error message
      }

      // Handle specific error cases
      if (parsedError && parsedError.errors && Array.isArray(parsedError.errors)) {
        // Handle validation errors from backend
        const validationErrors: Record<string, string> = {};
        parsedError.errors.forEach((error: string) => {
          if (error.toLowerCase().includes("password")) {
            validationErrors.password = error;
          } else if (error.toLowerCase().includes("email")) {
            validationErrors.email = error;
          } else if (error.toLowerCase().includes("username")) {
            validationErrors.username = error;
          } else {
            validationErrors.general = error;
          }
        });
        setErrors(validationErrors);
      } else if (
        errorMessage.includes("username") ||
        errorMessage.includes("DuplicateUserName") ||
        errorMessage.includes("already taken")
      ) {
        setErrors({ username: "This username is already taken" });
      } else if (errorMessage.includes("email") || errorMessage.includes("already exists")) {
        setErrors({ email: "This email is already registered" });
      } else if (
        errorMessage.includes("database synchronization") ||
        errorMessage.includes("MongoDB")
      ) {
        setErrors({
          general:
            "Registration failed due to a temporary database issue. Please try again in a moment.",
        });
      } else {
        setErrors({ general: errorMessage });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear field error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: "" }));
    }
  };

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

      {/* Register Form */}
      <Card className="w-full max-w-md animate-fade-in">
        <CardHeader className="text-center">
          <h1 className="text-3xl text-white">Make yourself at home</h1>
          <p className="text-gray-400 mt-2">Create your account to get started</p>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {errors.general && (
              <div
                role="alert"
                className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm"
              >
                {errors.general}
              </div>
            )}

            <Input
              label="Username"
              autoComplete="username"
              type="text"
              placeholder="Choose a username"
              value={formData.username}
              onChange={handleInputChange("username")}
              disabled={registrationPending || loading}
              error={errors.username}
              required
            />

            <Input
              label="Email"
              autoComplete="email"
              type="email"
              placeholder="Enter your email"
              value={formData.email}
              onChange={handleInputChange("email")}
              disabled={registrationPending || loading}
              error={errors.email}
              required
            />

            <div className="relative">
              <Input
                label="Password"
                autoComplete="new-password"
                className="pr-12"
                type={showPassword ? "text" : "password"}
                placeholder="Create a password"
                value={formData.password}
                onChange={handleInputChange("password")}
                disabled={registrationPending || loading}
                error={errors.password}
                required
              />
              <button
                type="button"
                className="icon-button absolute right-1 top-6"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                <span className="block h-5 w-5">
                  {isMounted && showPassword ? (
                    <EyeSlashIcon className="h-5 w-5" />
                  ) : (
                    <EyeIcon className="h-5 w-5" />
                  )}
                </span>
              </button>
              <p className="text-xs text-gray-400 mt-1">
                Use 8–100 characters with uppercase, lowercase, a number, a symbol and six unique
                characters.
              </p>
            </div>

            <div className="relative">
              <Input
                label="Confirm Password"
                autoComplete="new-password"
                className="pr-12"
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Confirm your password"
                value={formData.confirmPassword}
                onChange={handleInputChange("confirmPassword")}
                disabled={registrationPending || loading}
                error={errors.confirmPassword}
                required
              />
              <button
                type="button"
                className="icon-button absolute right-1 top-6"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                aria-label={showConfirmPassword ? "Hide password" : "Show password"}
              >
                <span className="block h-5 w-5">
                  {isMounted && showConfirmPassword ? (
                    <EyeSlashIcon className="h-5 w-5" />
                  ) : (
                    <EyeIcon className="h-5 w-5" />
                  )}
                </span>
              </button>
            </div>

            <div className="flex justify-center">
              <p className="text-xs text-gray-400">
                Choose a username you’ll use to connect with friends.
              </p>
            </div>
            {errors.recaptcha && (
              <p className="text-sm text-red-400 text-center">{errors.recaptcha}</p>
            )}

            <Button type="submit" className="w-full" loading={loading} size="lg">
              {loading
                ? "Please wait..."
                : registrationPending
                  ? "Retry sign-in"
                  : "Create Account"}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-gray-400">
              Already have an account?{" "}
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
