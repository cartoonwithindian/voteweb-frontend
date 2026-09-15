"use client";

import React, { useEffect, useState } from "react";

import { HelpCircle, ShieldAlert, KeyRound } from "lucide-react";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthHeader } from "@/components/auth/AuthHeader";
import { RoleSelector } from "@/components/auth/RoleSelector";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { setBindingToken } from "@/lib/session-binding";
import type { UserRole } from "@/lib/auth-types";

/** Store real auth info in a cookie (role comes from the backend). */
function setAuthCookie(role: UserRole, name: string, email: string) {
  if (typeof document !== "undefined") {
    const data = JSON.stringify({ role, name, email });
    document.cookie = `campusvote_auth=${encodeURIComponent(data)}; path=/; max-age=86400; SameSite=Lax`;
  }
}

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "/api/v1").replace(/\/$/, "");

const ROLE_LABEL: Record<string, string> = {
  student: "Student",
  candidate: "Candidate",
  cad: "CAD",
  administrator: "Administrator",
};

const REGISTER_LINK: Record<string, string> = {
  student: "/register/student",
  candidate: "/register/candidate",
};

/** Route by the account's ACTUAL role returned by the backend. */
function dashboardForBackendRole(backendRole: string | undefined): string {
  switch (String(backendRole || "").toUpperCase()) {
    case "ADMIN":
      return "/admin/dashboard";
    case "CAD":
      return "/cad/dashboard";
    case "CANDIDATE":
      return "/candidate/dashboard";
    default:
      return "/student/dashboard";
  }
}

export function RoleLoginPage({
  portal,
  initialRole,
}: {
  portal: "any" | "student" | "cad" | "admin";
  initialRole?: UserRole;
}) {
  const [selectedRole, setSelectedRole] = useState<UserRole>(
    initialRole ||
      (portal === "student"
        ? "student"
        : portal === "cad"
          ? "cad"
          : portal === "admin"
            ? "administrator"
            : "student")
  );

  const isAdminFlow = portal === "admin" || selectedRole === "administrator";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [notice, setNotice] = useState(
    portal === "admin"
      ? "Administrator access only — only listed administrator emails can sign in."
      : ""
  );
  const [error, setError] = useState("");

  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [isAdminLoggingIn, setIsAdminLoggingIn] = useState(false);

  useEffect(() => {
    const flagged = sessionStorage.getItem("campusvote_role_mismatch");
    if (flagged) {
      setNotice("");
      setError("This account is not authorized for this portal. Sign in from the correct portal for your role.");
      sessionStorage.removeItem("campusvote_role_mismatch");
    }
  }, []);

  const fetchCsrfToken = async (): Promise<string> => {
    try {
      const res = await fetch(`${API_BASE}/auth/csrf`, { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      return data.data?.csrfToken || "";
    } catch {
      return "";
    }
  };

  const login = async () => {
    setError("");
    if (!email || !email.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }
    if (!password) {
      setError("Enter your password.");
      return;
    }
    setIsLoggingIn(true);
    try {
      const normalized = email.trim().toLowerCase();
      const csrfToken = await fetchCsrfToken();

      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        // No role sent on purpose: the backend accepts the account's real
        // role and returns it — routing never depends on the picked portal.
        body: JSON.stringify({ userIdentifier: normalized, password }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 404 || data.data?.needsRegistration) {
          sessionStorage.setItem("campusvote_pending_email", normalized);
          sessionStorage.setItem("campusvote_pending_role", selectedRole);
          window.location.href = REGISTER_LINK[selectedRole] || "/register?from=login";
          return;
        }
        if (res.status === 423) {
          setError(data.error?.message || "This account is temporarily locked. Try again later.");
        } else {
          setError(data.error?.message || "Invalid email or password. Please try again.");
        }
        setIsLoggingIn(false);
        return;
      }

      // Success — store binding token and soft auth cookie with the REAL role.
      if (data.data?.bindingToken) {
        setBindingToken(data.data.bindingToken);
      }
      const user = data.data?.user;
      // Backend returns UPPERCASE roles (ADMIN, CANDIDATE, STUDENT, CAD).
      // Map to lowercase UserRole for the cookie.
      const backendRole = String(user?.role || "").toUpperCase();
      const roleMap: Record<string, UserRole> = {
        ADMIN: "administrator",
        CANDIDATE: "candidate",
        STUDENT: "student",
        CAD: "cad",
      };
      const cookieRole = roleMap[backendRole] || selectedRole;
      if (user) {
        setAuthCookie(cookieRole, user.name || user.fullName || "", user.email || normalized);
      }

      const dest = dashboardForBackendRole(user?.role);
      sessionStorage.removeItem("campusvote_bridged");
      sessionStorage.setItem("campusvote_dest", dest);
      window.location.href = dest;
    } catch (err) {
      console.error("login threw:", err);
      setError("Something went wrong. Please try again.");
      setIsLoggingIn(false);
    }
  };

  const adminLogin = async () => {
    setError("");
    if (!adminEmail || !adminEmail.includes("@") || !adminPassword) {
      setError("Enter both your administrator email and password.");
      return;
    }
    setIsAdminLoggingIn(true);
    try {
      const csrfToken = await fetchCsrfToken();

      const res = await fetch(`${API_BASE}/auth/admin-portal-login`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({
          email: adminEmail.trim().toLowerCase(),
          password: adminPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 401) {
          setError("Incorrect email or password. Check them and try again.");
        } else if (res.status === 423) {
          setError(data.error?.message || "This account is temporarily locked. Try again later.");
        } else {
          setError(data.error?.message || "The server is having trouble right now. Please wait a moment and try again.");
        }
        setIsAdminLoggingIn(false);
        return;
      }

      if (data.data?.bindingToken) setBindingToken(data.data.bindingToken);
      const user = data.data?.user;
      if (user?.name) setAuthCookie("administrator", user.name, user.email || adminEmail);
      sessionStorage.removeItem("campusvote_bridged");
      sessionStorage.setItem("campusvote_dest", "/admin/dashboard");
      window.location.href = "/admin/dashboard";
    } catch (err) {
      console.error("Admin login failed:", err);
      setError("Unable to reach the server. Please check your connection and try again.");
      setIsAdminLoggingIn(false);
    }
  };

  const roleKey = isAdminFlow ? "administrator" : selectedRole;

  return (
    <AuthLayout>
      <AuthCard>
        <div className="text-center mb-6">
          <AuthHeader
            title={
              portal === "admin"
                ? "Admin Portal"
                : portal === "cad"
                  ? "CAD Portal"
                  : portal === "student"
                    ? "Student Portal"
                    : "Sign In"
            }
            subtitle="Sign in with your email and password"
          />
        </div>

        {notice && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm break-words">
            {notice}
          </div>
        )}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm break-words">
            {error}
          </div>
        )}

        {isAdminFlow ? (
          <div className="space-y-4">
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600 text-center">
              Signing in as <strong>Administrator</strong>
            </div>

            <Input
              id="admin-email"
              label="Administrator email"
              type="email"
              autoComplete="username"
              placeholder="admin@example.com"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
            />
            <Input
              id="admin-password"
              label="Password"
              type="password"
              autoComplete="current-password"
              placeholder="Enter your password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") adminLogin();
              }}
            />

            <Button
              onClick={adminLogin}
              disabled={isAdminLoggingIn}
              isLoading={isAdminLoggingIn}
              className="w-full"
            >
              {!isAdminLoggingIn && (
                <>
                  <KeyRound className="w-4 h-4" />
                  Sign in to Admin
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {portal === "any" && selectedRole !== "cad" ? (
              <RoleSelector
                selectedRole={selectedRole}
                onSelect={(role) => {
                  setSelectedRole(role);
                  setError("");
                  setNotice("");
                }}
              />
            ) : (
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600 text-center">
                Signing in as <strong>{ROLE_LABEL[roleKey] || selectedRole}</strong>
              </div>
            )}

            <Input
              id="login-email"
              label="Email address"
              type="email"
              autoComplete="username"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              id="login-password"
              label="Password"
              type="password"
              autoComplete="current-password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") login();
              }}
            />

            <Button
              onClick={login}
              disabled={isLoggingIn}
              isLoading={isLoggingIn}
              className="w-full"
            >
              {!isLoggingIn && (
                <>
                  <KeyRound className="w-4 h-4" />
                  Sign in
                </>
              )}
            </Button>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-text-secondary pt-1">
              <a
                href={REGISTER_LINK[selectedRole] || "/register"}
                className="text-primary-600 hover:text-primary-700 font-medium"
              >
                {selectedRole === "candidate"
                  ? "New here? Register as a candidate"
                  : "New here? Register as a student"}
              </a>
              <a
                href="/email-recovery"
                className="hover:text-primary-600 transition-colors"
              >
                Can&apos;t access your registered email?
              </a>
            </div>
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-border text-xs text-text-secondary text-center flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 leading-relaxed px-1">
          <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
          <span>
            {isAdminFlow
              ? "Admin sign-in is protected — only listed administrators can access this portal"
              : "Your dashboard is chosen by your account role automatically"}
          </span>
          <HelpCircle className="w-3 h-3 opacity-50 shrink-0" />
        </div>
      </AuthCard>
    </AuthLayout>
  );
}
