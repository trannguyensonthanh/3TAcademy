/**
 * ============================================================================
 * TỆP: apps/api/src/modules/auth/auth.routes.ts
 * VAI TRÒ TRONG KIẾN TRÚC 3 TẦNG:
 *   - Tầng Backend (`apps/api`) — Module Xác thực & Quản lý Phiên đăng nhập (Authentication).
 *   - Đảm nhiệm đăng nhập Email/Password (băm mật khẩu bằng **Argon2**), đăng ký học viên mới
 *     (tạo đồng bộ `accounts` + `account_identities` + `user_profiles` trong 1 Transaction ACID),
 *     đăng nhập **Google OAuth 2.0** (xác thực chữ ký qua `oauth2.googleapis.com/tokeninfo`),
 *     cấp mới cặp JWT (`access_token`, `refresh_token`) gắn song song HttpOnly Cookie + JSON body,
 *     đăng xuất, lấy hồ sơ phiên hiện tại và đổi mật khẩu.
 *
 * LIÊN KẾT CHÉO (CROSS-LAYER):
 *   - Nhận gọi từ Frontend `apps/web/src/services/auth.api.ts`:
 *     + `authApi.login()`          -> `POST /api/v1/auth/login`
 *     + `authApi.register()`       -> `POST /api/v1/auth/register`
 *     + `authApi.googleAuth()` / `googleLogin()` -> `POST /api/v1/auth/google`
 *     + `authApi.getMe()`          -> `GET  /api/v1/auth/me`
 *     + `authApi.logout()`         -> `POST /api/v1/auth/logout`
 *     + `authApi.changePassword()` -> `POST /api/v1/auth/change-password`
 *     + `apiClient.ts` (auto-refresh) -> `POST /api/v1/auth/refresh`
 *   - Đọc/Ghi bảng DB: `accounts`, `user_profiles`, `account_identities`.
 *   - Gọi dịch vụ ngoài: Google OAuth2 TokenInfo API (không gọi `apps/ai-service`).
 * ============================================================================
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { accounts, userProfiles, accountIdentities } from '../../db/schema/index.js';
import { requireAuth } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { env } from '../../config/env.js';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email('Email không hợp lệ'),
  password: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự'),
});

const registerSchema = z.object({
  fullName: z.string().min(2, 'Họ tên tối thiểu 2 ký tự'),
  email: z.string().email('Email không hợp lệ'),
  password: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự'),
  phone: z.string().optional(),
  careerGoal: z.string().optional(),
});

const googleLoginSchema = z.object({
  idToken: z.string().min(1, 'Thiếu Google ID Token'),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1).optional(),
});

/** Kiểm tra request có đi qua HTTPS (trực tiếp hoặc sau Reverse Proxy như Nginx/Cloudflare qua `x-forwarded-proto`). */
function isHttpsRequest(req: Request): boolean {
  const forwardedProto = req.headers['x-forwarded-proto'];
  if (typeof forwardedProto === 'string' && forwardedProto.split(',')[0]?.trim() === 'https') {
    return true;
  }
  return Boolean(req.secure);
}

/**
 * Gắn cặp Cookie xác thực (`access_token`, `refresh_token`) với cờ bảo mật `httpOnly` (chống XSS đọc token).
 * - Nếu chạy HTTPS (Production cross-site): bật `secure: true` và `sameSite: 'none'`.
 * - Nếu chạy HTTP cục bộ (Dev): dùng `sameSite: 'lax'` để trình duyệt vẫn lưu cookie.
 */
function setAuthCookies(
  req: Request,
  res: Response,
  accessToken: string,
  refreshToken?: string
) {
  const isHttps = isHttpsRequest(req);
  const baseOptions = {
    httpOnly: true,
    secure: isHttps,
    sameSite: (isHttps ? 'none' : 'lax') as 'none' | 'lax',
    path: '/',
  };
  res.cookie('access_token', accessToken, {
    ...baseOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  if (refreshToken) {
    res.cookie('refresh_token', refreshToken, {
      ...baseOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }
}

/** Xóa sạch cookie phiên đăng nhập (`access_token`, `refresh_token`) với đúng tập thuộc tính như lúc tạo. */
function clearAuthCookies(req: Request, res: Response) {
  const isHttps = isHttpsRequest(req);
  const baseOptions = {
    httpOnly: true,
    secure: isHttps,
    sameSite: (isHttps ? 'none' : 'lax') as 'none' | 'lax',
    path: '/',
  };
  res.clearCookie('access_token', baseOptions);
  res.clearCookie('refresh_token', baseOptions);
}

/**
 * Ký phát cặp JWT (Access Token ngắn hạn + Refresh Token dài hạn) bằng hai khóa bí mật tách biệt.
 * - **Đầu vào:** Thông tin tối thiểu `{ id, email, role }` để middleware `requireAuth` phân quyền RBAC nhanh.
 * - **Đầu ra:** `{ accessToken, refreshToken }`.
 */
function generateTokens(user: { id: number; email: string; role: string }) {
  const accessToken = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'] }
  );
  const refreshToken = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'] }
  );
  return { accessToken, refreshToken };
}

/**
 * Chuẩn hóa đối tượng hồ sơ người dùng trả về Frontend, tự động hợp nhất thông tin từ cột `user_profiles`
 * với dữ liệu CV đã phân tích (`cvParsedData`) để tránh trống trường `phone`, `githubUrl`, `bio`, `careerGoal`.
 */
function formatUserResponse(
  account: { id: number; email: string; role: 'STUDENT' | 'INSTRUCTOR' | 'ADMIN' },
  profile?: {
    fullName: string;
    phone?: string | null;
    githubUrl?: string | null;
    linkedinUrl?: string | null;
    avatarUrl: string | null;
    bio: string | null;
    careerGoal: string | null;
    interviewCredits: number;
    preferences?: unknown;
    cvParsedData: unknown;
  }
) {
  const cvData = (profile?.cvParsedData ?? {}) as Record<string, unknown>;
  const phone =
    (profile?.phone && profile.phone.trim()) ||
    (typeof cvData.phone === 'string' && cvData.phone.trim() ? cvData.phone : undefined);
  const githubUrl =
    (profile?.githubUrl && profile.githubUrl.trim()) ||
    (typeof cvData.githubUrl === 'string' && cvData.githubUrl.trim()
      ? cvData.githubUrl
      : undefined);
  const linkedinUrl =
    (profile?.linkedinUrl && profile.linkedinUrl.trim()) ||
    (typeof cvData.linkedinUrl === 'string' && cvData.linkedinUrl.trim()
      ? cvData.linkedinUrl
      : undefined);
  return {
    id: String(account.id),
    email: account.email,
    fullName: profile?.fullName || account.email.split('@')[0] || '',
    role: account.role,
    avatarUrl: profile?.avatarUrl || undefined,
    phone,
    githubUrl,
    linkedinUrl,
    preferences: profile?.preferences ?? {},
    bio:
      profile?.bio ||
      (typeof cvData.headline === 'string' ? cvData.headline : undefined),
    careerGoal:
      profile?.careerGoal ||
      (typeof cvData.careerObjective === 'string' ? cvData.careerObjective : undefined),
    interviewCredits: profile?.interviewCredits ?? 0,
  };
}

/**
 * Route `POST /api/v1/auth/login` — Đăng nhập bằng Email và Mật khẩu.
 *
 * - **Mục tiêu:** Xác thực tài khoản nội bộ bằng thuật toán băm chống dò mật khẩu Argon2id,
 *   kiểm tra trạng thái khóa tài khoản (`LOCKED`) và cấp cặp JWT + HttpOnly Cookie.
 * - **Liên kết luồng (Cross-layer):**
 *   + Frontend gọi từ: `authApi.login(email, password)` (`apps/web/src/services/auth.api.ts`).
 *   + Đọc/Ghi DB: Đọc `accounts`, `user_profiles`; cập nhật `accounts.last_login_at`.
 *   + AI Service: Không gọi.
 * - **Đầu vào:** `{ email, password }` (validate qua `loginSchema`).
 * - **Đầu ra:** `{ accessToken, refreshToken, user, isNewUser: false }`.
 */
// 1.1 POST /auth/login
authRouter.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    // Bước 1: Chuẩn hóa email (chữ thường, cắt khoảng trắng) và tìm bản ghi tài khoản
    const { email, password } = req.body;
    const normalizedEmail = email.trim().toLowerCase();

    const [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.email, normalizedEmail))
      .limit(1);

    if (!account || !account.passwordHash) {
      res.status(401).json({
        success: false,
        status: 401,
        code: 'INVALID_CREDENTIALS',
        message: 'Email hoặc mật khẩu không chính xác',
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Email hoặc mật khẩu không chính xác',
        },
        requestId: req.correlationId,
      });
      return;
    }

    // Bước 2: Chặn đăng nhập nếu tài khoản đang bị Quản trị viên khóa (`LOCKED`)
    if (account.status === 'LOCKED') {
      res.status(403).json({
        success: false,
        status: 403,
        code: 'ACCOUNT_LOCKED',
        message: 'Tài khoản của bạn đã bị khóa bởi Quản trị viên',
        error: {
          code: 'ACCOUNT_LOCKED',
          message: 'Tài khoản của bạn đã bị khóa bởi Quản trị viên',
        },
        requestId: req.correlationId,
      });
      return;
    }

    // Bước 3: Đối chiếu mật khẩu thuần với chuỗi băm Argon2 lưu trong DB
    const isValid = await argon2.verify(account.passwordHash, password);
    if (!isValid) {
      res.status(401).json({
        success: false,
        status: 401,
        code: 'INVALID_CREDENTIALS',
        message: 'Email hoặc mật khẩu không chính xác',
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Email hoặc mật khẩu không chính xác',
        },
        requestId: req.correlationId,
      });
      return;
    }

    const [profile] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.accountId, account.id))
      .limit(1);

    await db
      .update(accounts)
      .set({ lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(accounts.id, account.id));

    const tokens = generateTokens(account);
    setAuthCookies(req, res, tokens.accessToken, tokens.refreshToken);

    res.json({
      ...tokens,
      user: formatUserResponse(account, profile),
      isNewUser: false,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Route `POST /api/v1/auth/register` — Đăng ký tài khoản Học viên mới.
 *
 * - **Mục tiêu:** Tạo đồng thời tài khoản (`accounts`), danh tính nội bộ (`account_identities`)
 *   và hồ sơ học viên (`user_profiles` với `interviewCredits = 0` + khung `cvParsedData` mặc định)
 *   trong một Transaction ACID để đảm bảo không bao giờ phát sinh tài khoản mồ côi hồ sơ.
 * - **Liên kết luồng (Cross-layer):**
 *   + Frontend gọi từ: `authApi.register(fullName, email, password)` (`apps/web/src/services/auth.api.ts`).
 *   + Đọc/Ghi DB: Đọc/Ghi `accounts`, ghi `account_identities`, ghi `user_profiles`.
 *   + AI Service: Không gọi.
 * - **Đầu vào:** `{ fullName, email, password, phone?, careerGoal? }` (`registerSchema`).
 * - **Đầu ra:** HTTP 201 `{ accessToken, refreshToken, user, isNewUser: true }`.
 */
// 1.2 POST /auth/register
authRouter.post('/register', validate(registerSchema), async (req, res, next) => {
  try {
    // Bước 1: Kiểm tra email đã tồn tại chưa (trả HTTP 409 nếu trùng)
    const { fullName, email, password, phone, careerGoal } = req.body;
    const normalizedEmail = email.trim().toLowerCase();

    const [existing] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.email, normalizedEmail))
      .limit(1);

    if (existing) {
      res.status(409).json({
        success: false,
        status: 409,
        code: 'EMAIL_ALREADY_EXISTS',
        message: 'Email này đã được đăng ký trong hệ thống',
        error: {
          code: 'EMAIL_ALREADY_EXISTS',
          message: 'Email này đã được đăng ký trong hệ thống',
        },
        requestId: req.correlationId,
      });
      return;
    }

    // Bước 2: Băm mật khẩu bằng Argon2 và khởi tạo avatar chữ cái đầu từ DiceBear
    const passwordHash = await argon2.hash(password);
    const defaultAvatar = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(fullName)}`;
    const resolvedGoal = careerGoal || '';
    const resolvedBio = '';

    // Bước 3: Mở Transaction ACID tạo 3 bảng liên kết (`accounts` -> `account_identities` -> `user_profiles`)
    // Ghi chú nghiệp vụ: Tài khoản mới có 0 lượt phỏng vấn AI; chỉ được cộng +4 lượt khi thanh toán mua khóa học
    const result = await db.transaction(async (tx) => {
      const [newAccount] = await tx
        .insert(accounts)
        .values({
          email: normalizedEmail,
          passwordHash,
          role: 'STUDENT',
          status: 'ACTIVE',
          emailVerifiedAt: new Date(),
          lastLoginAt: new Date(),
        })
        .returning();

      await tx.insert(accountIdentities).values({
        accountId: newAccount!.id,
        provider: 'LOCAL',
        providerUid: `local-${normalizedEmail}`,
        providerEmail: normalizedEmail,
      });

      const initialCvData = {
        fullName,
        email: normalizedEmail,
        phone: phone || '',
        avatarUrl: defaultAvatar,
        headline: resolvedBio,
        careerObjective: resolvedGoal,
        location: 'Việt Nam',
        skills: [],
        projects: [],
        workExperience: [],
        education: [],
        awardsAndCerts: [],
        externalSkills: [],
      };

      const [newProfile] = await tx
        .insert(userProfiles)
        .values({
          accountId: newAccount!.id,
          fullName,
          phone: phone || null,
          avatarUrl: defaultAvatar,
          bio: resolvedBio || null,
          careerGoal: resolvedGoal || null,
          interviewCredits: 0,
          cvParsedData: initialCvData,
        })
        .returning();

      return { account: newAccount!, profile: newProfile! };
    });

    const tokens = generateTokens(result.account);
    setAuthCookies(req, res, tokens.accessToken, tokens.refreshToken);

    res.status(201).json({
      ...tokens,
      user: formatUserResponse(result.account, result.profile),
      isNewUser: true,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Xác thực Google ID Token thông qua endpoint chính thức `oauth2.googleapis.com/tokeninfo`.
 *
 * - **Mục tiêu:** Chống giả mạo JWT không chữ ký bằng cách kiểm tra đủ 4 điều kiện mật mã học:
 *   `iss` (Google issuer), `email_verified === true`, `aud === GOOGLE_CLIENT_ID` và chưa hết hạn `exp`.
 *   (Ở môi trường dev/test cho phép tiền tố `dev-google-oauth:<email>` để kiểm thử luồng OAuth cục bộ).
 * - **Đầu vào:** `idToken` chuỗi token Google do Frontend gửi lên.
 * - **Đầu ra:** `{ email, name, sub, picture }` nếu hợp lệ, hoặc `null` nếu bị từ chối.
 */
async function verifyGoogleIdTokenPayload(idToken: string): Promise<{
  email: string;
  name: string;
  sub: string;
  picture: string;
} | null> {
  const trimmed = (idToken || '').trim();
  if (!trimmed) return null;

  // Explicit dev-only Google sandbox token (never accepts forged unsigned 3-part JWTs!)
  if (env.NODE_ENV !== 'production' && trimmed.startsWith('dev-google-oauth:')) {
    const devEmail = trimmed.slice('dev-google-oauth:'.length).trim().toLowerCase();
    if (devEmail && devEmail.includes('@')) {
      return {
        email: devEmail,
        name: devEmail.split('@')[0] || 'Học viên Google',
        sub: `dev_google_${devEmail}`,
        picture: '',
      };
    }
    return null;
  }

  // Real cryptographic verification via Google's official tokeninfo endpoint
  try {
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(trimmed)}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;

    const info = (await res.json()) as {
      iss?: string;
      aud?: string;
      sub?: string;
      email?: string;
      email_verified?: string | boolean;
      name?: string;
      picture?: string;
      exp?: string;
    };

    const validIss =
      info.iss === 'https://accounts.google.com' || info.iss === 'accounts.google.com';
    const isVerified = info.email_verified === true || info.email_verified === 'true';
    const configuredClientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
    const validAud = !configuredClientId || info.aud === configuredClientId;
    const notExpired = !info.exp || Number(info.exp) * 1000 > Date.now();

    if (!validIss || !isVerified || !validAud || !notExpired || !info.email || !info.sub) {
      return null;
    }

    return {
      email: info.email.trim().toLowerCase(),
      name: (info.name || info.email.split('@')[0] || 'Học viên').trim(),
      sub: info.sub,
      picture: info.picture || '',
    };
  } catch {
    return null;
  }
}

/**
 * Route `POST /api/v1/auth/google` — Đăng nhập / Đăng ký tự động qua Google OAuth 2.0.
 *
 * - **Mục tiêu:** Xác thực Google ID Token; nếu email chưa tồn tại thì tự động tạo tài khoản
 *   `STUDENT` + `account_identities (GOOGLE)` + `user_profiles` trong 1 Transaction ACID;
 *   nếu đã tồn tại thì kiểm tra khóa tài khoản và cập nhật `lastLoginAt`.
 * - **Liên kết luồng (Cross-layer):**
 *   + Frontend gọi từ: `authApi.googleAuth(idToken)` / `authApi.googleLogin(idToken)` (`apps/web/src/services/auth.api.ts`).
 *   + Đọc/Ghi DB: `accounts`, `account_identities`, `user_profiles`.
 *   + Dịch vụ ngoài: `https://oauth2.googleapis.com/tokeninfo` (không gọi `apps/ai-service`).
 * - **Đầu vào:** `{ idToken }` (`googleLoginSchema`).
 * - **Đầu ra:** `{ accessToken, refreshToken, user, isNewUser }`.
 */
// 1.3 POST /auth/google
authRouter.post('/google', validate(googleLoginSchema), async (req, res, next) => {
  try {
    const { idToken } = req.body;
    const verifiedGoogle = await verifyGoogleIdTokenPayload(idToken);

    if (!verifiedGoogle) {
      res.status(401).json({
        success: false,
        status: 401,
        code: 'INVALID_GOOGLE_TOKEN',
        message: 'Google ID Token không hợp lệ, đã hết hạn hoặc không xác thực được chữ ký Google',
        error: {
          code: 'INVALID_GOOGLE_TOKEN',
          message: 'Google ID Token không hợp lệ, đã hết hạn hoặc không xác thực được chữ ký Google',
        },
        requestId: req.correlationId,
      });
      return;
    }

    const targetEmail = verifiedGoogle.email;
    const targetName = verifiedGoogle.name;
    const targetUid = verifiedGoogle.sub;
    const targetPicture = verifiedGoogle.picture;

    let [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.email, targetEmail))
      .limit(1);

    let isNewUser = false;

    if (!account) {
      isNewUser = true;
      account = await db.transaction(async (tx) => {
        const [createdAcc] = await tx
          .insert(accounts)
          .values({
            email: targetEmail,
            role: 'STUDENT',
            status: 'ACTIVE',
            emailVerifiedAt: new Date(),
            lastLoginAt: new Date(),
          })
          .returning();

        await tx.insert(accountIdentities).values({
          accountId: createdAcc!.id,
          provider: 'GOOGLE',
          providerUid: targetUid,
          providerEmail: targetEmail,
        });

        const avatarUrl =
          targetPicture ||
          `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(targetName)}`;
        await tx.insert(userProfiles).values({
          accountId: createdAcc!.id,
          fullName: targetName,
          avatarUrl,
          bio: null,
          careerGoal: null,
          interviewCredits: 0,
          cvParsedData: {
            fullName: targetName,
            email: targetEmail,
            phone: '',
            avatarUrl,
            headline: '',
            careerObjective: '',
            skills: [],
            projects: [],
            workExperience: [],
            education: [],
            awardsAndCerts: [],
          },
        });

        return createdAcc!;
      });
    } else {
      // Bước 2: Chặn đăng nhập nếu tài khoản đang bị Quản trị viên khóa (`LOCKED`)
    if (account.status === 'LOCKED') {
        res.status(403).json({
          success: false,
          status: 403,
          code: 'ACCOUNT_LOCKED',
          message: 'Tài khoản của bạn đã bị khóa bởi Quản trị viên',
          error: {
            code: 'ACCOUNT_LOCKED',
            message: 'Tài khoản của bạn đã bị khóa bởi Quản trị viên',
          },
          requestId: req.correlationId,
        });
        return;
      }

      await db
        .update(accounts)
        .set({ lastLoginAt: new Date(), updatedAt: new Date() })
        .where(eq(accounts.id, account.id));
    }

    const [profile] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.accountId, account.id))
      .limit(1);

    const tokens = generateTokens(account);
    setAuthCookies(req, res, tokens.accessToken, tokens.refreshToken);

    res.json({
      ...tokens,
      user: formatUserResponse(account, profile),
      isNewUser,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Route `POST /api/v1/auth/refresh` — Làm mới cặp JWT (Token Rotation) khi Access Token hết hạn.
 *
 * - **Mục tiêu:** Đọc `refreshToken` từ body hoặc HttpOnly Cookie `refresh_token`, xác thực chữ ký
 *   bằng `JWT_REFRESH_SECRET`, kiểm tra tài khoản còn hoạt động trong DB rồi cấp cặp token mới.
 *   Nếu token sai hoặc tài khoản bị khóa thì tự động xóa sạch Cookie phiên.
 * - **Liên kết luồng (Cross-layer):**
 *   + Frontend gọi từ: `apps/web/src/services/apiClient.ts` (khi gặp HTTP 401 token hết hạn).
 *   + Đọc DB: `accounts`.
 * - **Đầu vào:** `{ refreshToken? }` hoặc Cookie `refresh_token`.
 * - **Đầu ra:** `{ accessToken, refreshToken }`.
 */
// 1.4 POST /auth/refresh
authRouter.post('/refresh', validate(refreshSchema), async (req, res) => {
  const refreshToken =
    (typeof req.body?.refreshToken === 'string' && req.body.refreshToken.trim()) ||
    (typeof req.cookies?.refresh_token === 'string' && req.cookies.refresh_token.trim()) ||
    '';

  if (!refreshToken) {
    res.status(401).json({
      success: false,
      status: 401,
      code: 'MISSING_REFRESH_TOKEN',
      message: 'Thiếu Refresh Token',
      error: {
        code: 'MISSING_REFRESH_TOKEN',
        message: 'Thiếu Refresh Token',
      },
      requestId: req.correlationId,
    });
    return;
  }

  try {
    const payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as {
      id: number;
      email: string;
      role: string;
    };

    const [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, payload.id))
      .limit(1);

    if (!account || account.status === 'LOCKED') {
      clearAuthCookies(req, res);
      res.status(401).json({
        success: false,
        status: 401,
        code: 'ACCOUNT_UNAVAILABLE',
        message: 'Tài khoản không tồn tại hoặc đã bị khóa',
        error: {
          code: 'ACCOUNT_UNAVAILABLE',
          message: 'Tài khoản không tồn tại hoặc đã bị khóa',
        },
        requestId: req.correlationId,
      });
      return;
    }

    const tokens = generateTokens(account);
    setAuthCookies(req, res, tokens.accessToken, tokens.refreshToken);
    res.json(tokens);
  } catch {
    clearAuthCookies(req, res);
    res.status(401).json({
      success: false,
      status: 401,
      code: 'INVALID_REFRESH_TOKEN',
      message: 'Refresh token không hợp lệ hoặc đã hết hạn',
      error: {
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Refresh token không hợp lệ hoặc đã hết hạn',
      },
      requestId: req.correlationId,
    });
  }
});

/**
 * Route `POST /api/v1/auth/logout` — Đăng xuất và xóa sạch Cookie xác thực HttpOnly.
 *
 * - **Liên kết luồng (Cross-layer):**
 *   + Frontend gọi từ: `authApi.logout()` (`apps/web/src/services/auth.api.ts`).
 *   + DB / AI Service: Không truy vấn.
 */
// 1.5 POST /auth/logout
authRouter.post('/logout', (req, res) => {
  clearAuthCookies(req, res);
  res.json({
    success: true,
    loggedOutAt: new Date().toISOString(),
    message: 'Đã đăng xuất thành công',
  });
});

/**
 * Route `GET /api/v1/auth/me` — Lấy thông tin tài khoản và hồ sơ của phiên đăng nhập hiện tại.
 *
 * - **Mục tiêu:** Đồng bộ lại trạng thái mới nhất (vai trò, `interviewCredits`, ảnh đại diện, khóa tài khoản)
 *   khi người dùng tải lại trang (F5).
 * - **Liên kết luồng (Cross-layer):**
 *   + Frontend gọi từ: `authApi.getMe()` (`apps/web/src/services/auth.api.ts`).
 *   + Đọc DB: `accounts`, `user_profiles`.
 * - **Đầu ra:** `{ user }`.
 */
// 1.6 GET /auth/me
authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const accountId = req.user!.id;
    const [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .limit(1);

    if (!account) {
      res.status(401).json({
        success: false,
        status: 401,
        code: 'ACCOUNT_NOT_FOUND',
        message: 'Không tìm thấy tài khoản người dùng',
        error: {
          code: 'ACCOUNT_NOT_FOUND',
          message: 'Không tìm thấy tài khoản người dùng',
        },
        requestId: req.correlationId,
      });
      return;
    }

    // Bước 2: Chặn đăng nhập nếu tài khoản đang bị Quản trị viên khóa (`LOCKED`)
    if (account.status === 'LOCKED') {
      res.status(403).json({
        success: false,
        status: 403,
        code: 'ACCOUNT_LOCKED',
        message: 'Tài khoản của bạn đã bị khóa bởi Quản trị viên',
        error: {
          code: 'ACCOUNT_LOCKED',
          message: 'Tài khoản của bạn đã bị khóa bởi Quản trị viên',
        },
        requestId: req.correlationId,
      });
      return;
    }

    const [profile] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.accountId, account.id))
      .limit(1);

    res.json({
      user: formatUserResponse(account, profile),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Route `POST /api/v1/auth/change-password` — Đổi mật khẩu đăng nhập cho người dùng hiện tại.
 *
 * - **Mục tiêu:** Bắt buộc xác minh lại mật khẩu hiện tại bằng `argon2.verify()` trước khi băm và lưu
 *   mật khẩu mới vào `accounts.password_hash` nhằm phòng chống chiếm đoạt phiên (session hijacking).
 * - **Liên kết luồng (Cross-layer):**
 *   + Frontend gọi từ: `authApi.changePassword(currentPassword, newPassword)` (`apps/web/src/services/auth.api.ts`).
 *   + Đọc/Ghi DB: `accounts`.
 * - **Đầu vào:** `{ currentPassword, newPassword }` (`changePasswordSchema`).
 * - **Đầu ra:** `{ success: true, message }`.
 */
// 1.7 POST /auth/change-password
const changePasswordSchema = z.object({
  currentPassword: z.string().min(6, 'Vui lòng nhập mật khẩu hiện tại (tối thiểu 6 ký tự)'),
  newPassword: z.string().min(6, 'Mật khẩu mới phải có tối thiểu 6 ký tự'),
});

authRouter.post(
  '/change-password',
  requireAuth,
  validate(changePasswordSchema),
  async (req, res, next) => {
    try {
      const accountId = req.user!.id;
      const { currentPassword, newPassword } = req.body;

      const [account] = await db
        .select()
        .from(accounts)
        .where(eq(accounts.id, accountId))
        .limit(1);

      if (!account || !account.passwordHash) {
        res.status(404).json({
          success: false,
          status: 404,
          code: 'ACCOUNT_NOT_FOUND',
          message: 'Không tìm thấy tài khoản người dùng',
        });
        return;
      }

      const isCurrentValid = await argon2.verify(account.passwordHash, currentPassword);
      if (!isCurrentValid) {
        res.status(400).json({
          success: false,
          status: 400,
          code: 'INVALID_CURRENT_PASSWORD',
          message: 'Mật khẩu hiện tại không chính xác. Vui lòng kiểm tra lại.',
          error: {
            code: 'INVALID_CURRENT_PASSWORD',
            message: 'Mật khẩu hiện tại không chính xác. Vui lòng kiểm tra lại.',
          },
        });
        return;
      }

      const newPasswordHash = await argon2.hash(newPassword);
      await db
        .update(accounts)
        .set({
          passwordHash: newPasswordHash,
          updatedAt: new Date(),
        })
        .where(eq(accounts.id, accountId));

      res.json({
        success: true,
        message: 'Đã cập nhật mật khẩu đăng nhập mới thành công.',
      });
    } catch (err) {
      next(err);
    }
  }
);

