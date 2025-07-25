"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline";
import ReCAPTCHA from "react-google-recaptcha";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { identityApi, type RegisterRequest, logApiConfig } from "@/lib/api";

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
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Debug API configuration after component mounts
    logApiConfig();
  }, []);

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

    // reCAPTCHA validation
    if (!formData.recaptchaToken) {
      newErrors.recaptcha = "Please complete the CAPTCHA";
    }

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
      await identityApi.register(registerData);
      
      // Auto-login after successful registration
      await identityApi.login({
        username: formData.username,
        password: formData.password,
      });
      
      router.push("/dashboard");
    } catch (error) {
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
      } else if (errorMessage.includes("username") || errorMessage.includes("DuplicateUserName") || errorMessage.includes("already taken")) {
        setErrors({ username: "This username is already taken" });
      } else if (errorMessage.includes("email") || errorMessage.includes("already exists")) {
        setErrors({ email: "This email is already registered" });
      } else {
        setErrors({ general: errorMessage });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof FormData) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear field error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: "" }));
    }
  };

  const handleRecaptchaChange = (token: string | null) => {
    setFormData(prev => ({ ...prev, recaptchaToken: token }));
    if (errors.recaptcha) {
      setErrors(prev => ({ ...prev, recaptcha: "" }));
    }
  };

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

      {/* Register Form */}
      <Card className="w-full max-w-md animate-fade-in">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl gradient-text">Join Spotibuds</CardTitle>
          <p className="text-gray-400 mt-2">Create your account to get started</p>
        </CardHeader>
        
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {errors.general && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                {errors.general}
              </div>
            )}

            <Input
              label="Username"
              type="text"
              placeholder="Choose a username"
              value={formData.username}
              onChange={handleInputChange("username")}
              error={errors.username}
              required
            />

            <Input
              label="Email"
              type="email"
              placeholder="Enter your email"
              value={formData.email}
              onChange={handleInputChange("email")}
              error={errors.email}
              required
            />

            <div className="relative">
              <Input
                label="Password"
                type={showPassword ? "text" : "password"}
                placeholder="Create a password"
                value={formData.password}
                onChange={handleInputChange("password")}
                error={errors.password}
                required
              />
              <button
                type="button"
                className="absolute right-3 top-8 text-gray-400 hover:text-gray-300 transition-colors"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <EyeSlashIcon className="h-5 w-5" />
                ) : (
                  <EyeIcon className="h-5 w-5" />
                )}
              </button>
              <p className="text-xs text-gray-400 mt-1">
                Password must contain at least 8 characters, including uppercase, lowercase, numbers, and special characters
              </p>
            </div>

            <div className="relative">
              <Input
                label="Confirm Password"
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Confirm your password"
                value={formData.confirmPassword}
                onChange={handleInputChange("confirmPassword")}
                error={errors.confirmPassword}
                required
              />
              <button
                type="button"
                className="absolute right-3 top-8 text-gray-400 hover:text-gray-300 transition-colors"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                aria-label={showConfirmPassword ? "Hide password" : "Show password"}
              >
                {showConfirmPassword ? (
                  <EyeSlashIcon className="h-5 w-5" />
                ) : (
                  <EyeIcon className="h-5 w-5" />
                )}
              </button>
            </div>



            <div className="flex justify-center">
              <ReCAPTCHA
                sitekey="6Lc_XnUrAAAAAJifrj3oH0a2EGx6ml4pWIrlYKus"
                theme="dark"
                onChange={handleRecaptchaChange}
              />
            </div>
            {errors.recaptcha && (
              <p className="text-sm text-red-400 text-center">{errors.recaptcha}</p>
            )}

            <Button
              type="submit"
              className="w-full"
              loading={loading}
              size="lg"
            >
              {loading ? "Creating account..." : "Create Account"}
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