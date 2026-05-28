import { z } from 'zod';

const email = z.string().trim().toLowerCase().max(254).pipe(z.email());
const password = z.string().min(8).max(128);

export const registerSchema = z.object({
  email,
  password,
  displayName: z.string().trim().min(1).max(100).optional(),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(128),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(20).max(300),
});

// Logout accepts a missing or empty body.
export const optionalRefreshSchema = refreshSchema.partial().default({});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: password,
});
