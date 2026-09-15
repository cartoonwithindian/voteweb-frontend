import { api } from "./client";

export interface LoginRequest {
  userIdentifier: string;
  password: string;
  role?: "STUDENT" | "CANDIDATE" | "ADMIN" | "CAD";
}

export interface LoginResponse {
  authenticated: boolean;
  requiresPasswordChange?: boolean;
  bindingToken?: string;
  mfaRequired?: boolean;
  mfaChallenge?: string;
  user?: {
    id: number;
    name: string;
    email: string;
    role: string;
    department?: string;
    year?: string;
  };
}

export interface ResetPasswordRequest {
  email: string;
}

export interface ChangePasswordRequest {
  challengeId: string;
  newPassword: string;
  confirmPassword: string;
}

export const authApi = {
  login: (data: LoginRequest) => api.post<LoginResponse>("/auth/login", data),
  logout: () => api.post("/auth/logout", {}),
  getMe: () => api.get<{ authenticated: boolean; user?: LoginResponse["user"] }>("/auth/me"),
  forgotPassword: (data: ResetPasswordRequest) => api.post("/auth/otp/send-reset", data),
  resetPassword: (data: ChangePasswordRequest) => api.post("/auth/reset-password", data),
};
