import { Router } from 'express';
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
  refreshToken: z.string().min(1, 'Thiếu Refresh Token'),
});

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

function formatUserResponse(
  account: { id: number; email: string; role: 'STUDENT' | 'INSTRUCTOR' | 'ADMIN' },
  profile?: {
    fullName: string;
    avatarUrl: string | null;
    bio: string | null;
    careerGoal: string | null;
    interviewCredits: number;
    cvParsedData: unknown;
  }
) {
  const cvData = (profile?.cvParsedData ?? {}) as Record<string, unknown>;
  const phone = typeof cvData.phone === 'string' && cvData.phone.trim() ? cvData.phone : undefined;
  return {
    id: String(account.id),
    email: account.email,
    fullName: profile?.fullName || account.email.split('@')[0] || '',
    role: account.role,
    avatarUrl: profile?.avatarUrl || undefined,
    phone,
    bio:
      profile?.bio ||
      (typeof cvData.headline === 'string' ? cvData.headline : undefined),
    careerGoal:
      profile?.careerGoal ||
      (typeof cvData.careerObjective === 'string' ? cvData.careerObjective : undefined),
    interviewCredits: profile?.interviewCredits ?? (account.role === 'STUDENT' ? 2 : 0),
  };
}

// 1.1 POST /auth/login
authRouter.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
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

    res.json({
      ...tokens,
      user: formatUserResponse(account, profile),
      isNewUser: false,
    });
  } catch (err) {
    next(err);
  }
});

// 1.2 POST /auth/register
authRouter.post('/register', validate(registerSchema), async (req, res, next) => {
  try {
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

    const passwordHash = await argon2.hash(password);
    const defaultAvatar = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(fullName)}`;
    const resolvedGoal = careerGoal || '';
    const resolvedBio = '';

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
          avatarUrl: defaultAvatar,
          bio: resolvedBio || null,
          careerGoal: resolvedGoal || null,
          interviewCredits: 2,
          cvParsedData: initialCvData,
        })
        .returning();

      return { account: newAccount!, profile: newProfile! };
    });

    const tokens = generateTokens(result.account);

    res.status(201).json({
      ...tokens,
      user: formatUserResponse(result.account, result.profile),
      isNewUser: true,
    });
  } catch (err) {
    next(err);
  }
});

// 1.3 POST /auth/google
authRouter.post('/google', validate(googleLoginSchema), async (req, res, next) => {
  try {
    const { idToken } = req.body;

    let targetEmail = '';
    let targetName = '';
    let targetUid = '';
    let targetPicture = '';

    const parts = idToken.split('.');
    if (parts.length === 3 && parts[1]) {
      try {
        const decodedJson = Buffer.from(parts[1], 'base64url').toString('utf8');
        const payload = JSON.parse(decodedJson) as {
          email?: string;
          name?: string;
          sub?: string;
          picture?: string;
        };
        if (payload.email) targetEmail = payload.email.trim().toLowerCase();
        if (payload.name) targetName = payload.name.trim();
        if (payload.sub) targetUid = payload.sub;
        if (payload.picture) targetPicture = payload.picture;
      } catch {
        // Handled below if targetEmail is empty
      }
    }

    if (!targetEmail) {
      res.status(400).json({
        success: false,
        status: 400,
        code: 'INVALID_GOOGLE_TOKEN',
        message: 'Google ID Token không hợp lệ hoặc không chứa thông tin email',
        error: {
          code: 'INVALID_GOOGLE_TOKEN',
          message: 'Google ID Token không hợp lệ hoặc không chứa thông tin email',
        },
        requestId: req.correlationId,
      });
      return;
    }

    if (!targetName) {
      targetName = targetEmail.split('@')[0] || 'Học viên';
    }
    if (!targetUid) {
      targetUid = `google_${targetEmail}`;
    }

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
          interviewCredits: 2,
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

    res.json({
      ...tokens,
      user: formatUserResponse(account, profile),
      isNewUser,
    });
  } catch (err) {
    next(err);
  }
});

// 1.4 POST /auth/refresh
authRouter.post('/refresh', validate(refreshSchema), async (req, res) => {
  const { refreshToken } = req.body;
  try {
    const payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as {
      id: number;
      email: string;
      role: string;
    };
    const accessToken = jwt.sign(
      { id: payload.id, email: payload.email, role: payload.role },
      env.JWT_ACCESS_SECRET,
      { expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'] }
    );
    res.json({ accessToken });
  } catch {
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

// 1.5 POST /auth/logout
authRouter.post('/logout', (_req, res) => {
  res.json({
    success: true,
    loggedOutAt: new Date().toISOString(),
    message: 'Đã đăng xuất thành công',
  });
});

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
