import { env } from '../../config/env.js';
import { ApiError, asyncHandler, created, noContent, ok } from '../../utils/http.js';
import * as authService from './auth.service.js';

const requestMeta = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') || '' });

// Refresh token cookie. httpOnly keeps it away from JavaScript; the path limits it to the auth routes.
// Cross-site deployments (API and client on different sites) need SameSite=None, which browsers only
// accept with Secure. Same-site deployments can set REFRESH_COOKIE_SAMESITE=strict (or lax).
const COOKIE_NAME = 'c8r_rt';
const COOKIE_PATH = '/api/auth';
const SAME_SITE = (() => {
  const v = (process.env.REFRESH_COOKIE_SAMESITE || '').toLowerCase();
  if (['strict', 'lax', 'none'].includes(v)) return v;
  return env.isProd ? 'none' : 'lax';
})();
const SECURE = env.isProd || SAME_SITE === 'none';

const cookieOptions = () => ({ httpOnly: true, secure: SECURE, sameSite: SAME_SITE, path: COOKIE_PATH });

const readCookie = (req, name) => {
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
};

// CSRF guard for cookie-authenticated endpoints: a browser request from another origin is refused.
const assertTrustedOrigin = (req) => {
  const origin = req.get('origin');
  if (origin && !env.clientOrigins.includes(origin)) throw new ApiError(403, 'Origin not allowed');
};

// Moves the refresh token out of the JSON body and into the cookie.
const withRefreshCookie = (res, result) => {
  const { refreshToken, refreshExpiresAt, ...tokens } = result.tokens;
  res.cookie(COOKIE_NAME, refreshToken, { ...cookieOptions(), expires: new Date(refreshExpiresAt) });
  return { ...result, tokens: { ...tokens, refreshExpiresAt } };
};

export const register = asyncHandler(async (req, res) => {
  created(res, withRefreshCookie(res, await authService.registerUser(req.valid.body, requestMeta(req))));
});

export const login = asyncHandler(async (req, res) => {
  ok(res, withRefreshCookie(res, await authService.loginUser(req.valid.body, requestMeta(req))));
});

export const refresh = asyncHandler(async (req, res) => {
  assertTrustedOrigin(req);
  const refreshToken = readCookie(req, COOKIE_NAME);
  if (!refreshToken) throw new ApiError(401, 'Invalid or expired refresh token');
  try {
    ok(res, withRefreshCookie(res, await authService.refreshSession({ refreshToken }, requestMeta(req))));
  } catch (err) {
    if (err instanceof ApiError && err.statusCode === 401) res.clearCookie(COOKIE_NAME, cookieOptions());
    throw err;
  }
});

// Needs no access token: the cookie is the credential, so an expired access token cannot block sign-out.
export const logout = asyncHandler(async (req, res) => {
  assertTrustedOrigin(req);
  await authService.logoutSession({ refreshToken: readCookie(req, COOKIE_NAME) });
  res.clearCookie(COOKIE_NAME, cookieOptions());
  noContent(res);
});

export const logoutAll = asyncHandler(async (req, res) => {
  await authService.revokeAllSessions(req.user.id);
  res.clearCookie(COOKIE_NAME, cookieOptions());
  noContent(res);
});

export const me = asyncHandler(async (req, res) => {
  ok(res, await authService.getMe(req.user.id));
});

export const changePassword = asyncHandler(async (req, res) => {
  await authService.changePassword(req.user.id, req.valid.body, requestMeta(req));
  res.clearCookie(COOKIE_NAME, cookieOptions());
  noContent(res);
});
