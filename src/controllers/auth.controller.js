const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { prisma } = require('../config/database');
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  generatePasswordResetToken,
  verifyPasswordResetToken,
} = require('../config/jwt');
const { successResponse, errorResponse } = require('../utils/response');
const { sendEmail } = require('../utils/email');
const { generateOTP } = require('../utils/otp');

function passwordVersion(password) {
  return crypto.createHash('sha256').update(password).digest('hex').slice(0, 16);
}

// ─── Register Student ─────────────────────────────────────────────────────────
async function registerStudent(req, res, next) {
  try {
    const { name, email, password } = req.body;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return errorResponse(res, { statusCode: 409, message: 'Email already registered.' });

    const hashedPassword = await bcrypt.hash(password, 12);

    const otp = generateOTP();

    const user = await prisma.user.create({
      data: { name, email, password: hashedPassword, role: 'STUDENT' , emailVerified: false},
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });

    await prisma.emailVerificationOTP.deleteMany({
      where: { email },
    });

    await prisma.emailVerificationOTP.create({
      data: {
        email,
        otp,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    await sendVerificationOTP(
      user.email,
      user.name,
      otp
    );

    // const accessToken = generateAccessToken({ id: user.id, role: user.role });
    // const refreshToken = generateRefreshToken({ id: user.id });
    // await prisma.refreshToken.create({
    //   data: { token: refreshToken, userId: user.id, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    // });

    return successResponse(res, {
      statusCode: 201,
      // message: 'Student account created successfully, verification code sent to email.',
      // data: { user, accessToken, refreshToken },
      message: 'Verification code sent to your email.',
      data: {
        email: user.email,
      },
    });
  } catch (error) {
    next(error);
  }
}

// ─── Register Instructor ──────────────────────────────────────────────────────
async function registerInstructor(req, res, next) {
  try {
    const { name, email, password, headline, bio } = req.body;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return errorResponse(res, { statusCode: 409, message: 'Email already registered.' });

    const hashedPassword = await bcrypt.hash(password, 12);

    const otp = generateOTP();

    const user = await prisma.user.create({
      data: { name, email, password: hashedPassword, role: 'INSTRUCTOR', headline: headline || null, bio: bio || null, emailVerified: false },
      select: { id: true, name: true, email: true, role: true, headline: true, createdAt: true },
    });

    await prisma.emailVerificationOTP.deleteMany({
      where: { email },
    });

    await prisma.emailVerificationOTP.create({
      data: {
        email,
        otp,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    await sendVerificationOTP(
      user.email,
      user.name,
      otp
    );

    // const accessToken = generateAccessToken({ id: user.id, role: user.role });
    // const refreshToken = generateRefreshToken({ id: user.id });
    // await prisma.refreshToken.create({
    //   data: { token: refreshToken, userId: user.id, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    // });

    return successResponse(res, {
      statusCode: 201,
      // message: 'Instructor account created. Pending admin approval.',
      // data: { user, accessToken, refreshToken },
      message: 'Verification code sent to your email.',
      data: {
        email: user.email,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function verifyEmailOTP(req, res, next) {
  try {
    const { email, otp } = req.body;

    const record =
      await prisma.emailVerificationOTP.findFirst({
        where: {
          email,
          otp,
          
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

    if (!record) {
      return errorResponse(res, {
        statusCode: 400,
        message: 'Invalid OTP.',
      });
    }

    if (record.expiresAt < new Date()) {
      return errorResponse(res, {
        statusCode: 400,
        message: 'OTP expired.',
      });
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { email },
        data: {
          emailVerified: true,
        },
      }),

      prisma.emailVerificationOTP.deleteMany({
        where: { email },
      }),
    ]);

    return successResponse(res, {
      message: 'Email verified successfully.',
    });
  } catch (error) {
    next(error);
  }
}

// ─── Login (unified — role returned in response) ──────────────────────────────
async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return errorResponse(res, { statusCode: 401, message: 'Invalid email or password.' });

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) return errorResponse(res, { statusCode: 401, message: 'Invalid email or password.' });
    if (!user.emailVerified) {
      return errorResponse(res, {
        statusCode: 403,
        message:
          'Please verify your email before logging in.',
      });
    }
    if (!user.isActive) return errorResponse(res, { statusCode: 403, message: 'Your account has been deactivated. Contact support.' });

    const accessToken = generateAccessToken({ id: user.id, role: user.role });
    const refreshToken = generateRefreshToken({ id: user.id });
    await prisma.refreshToken.create({
      data: { token: refreshToken, userId: user.id, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    });

    return successResponse(res, {
      message: 'Login successful.',
      data: {
        user: { id: user.id, name: user.name, email: user.email, role: user.role, avatar: user.avatar },
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    next(error);
  }
}

// ─── Refresh Token ────────────────────────────────────────────────────────────
async function refreshToken(req, res, next) {
  try {
    const { refreshToken: token } = req.body;
    const stored = await prisma.refreshToken.findUnique({ where: { token } });
    if (!stored || stored.expiresAt < new Date()) {
      return errorResponse(res, { statusCode: 401, message: 'Invalid or expired refresh token.' });
    }

    const decoded = verifyRefreshToken(token);
    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user || !user.isActive) return errorResponse(res, { statusCode: 401, message: 'User not found or deactivated.' });

    await prisma.refreshToken.delete({ where: { token } });
    const newAccessToken = generateAccessToken({ id: user.id, role: user.role });
    const newRefreshToken = generateRefreshToken({ id: user.id });
    await prisma.refreshToken.create({
      data: { token: newRefreshToken, userId: user.id, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    });

    return successResponse(res, { message: 'Token refreshed.', data: { accessToken: newAccessToken, refreshToken: newRefreshToken } });
  } catch (error) {
    next(error);
  }
}

// ─── Logout ───────────────────────────────────────────────────────────────────
async function logout(req, res, next) {
  try {
    const { refreshToken: token } = req.body;
    if (token) await prisma.refreshToken.deleteMany({ where: { token } });
    return successResponse(res, { message: 'Logged out successfully.' });
  } catch (error) {
    next(error);
  }
}

// ─── Get Me ───────────────────────────────────────────────────────────────────
async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body;
    const normalizedEmail = email.toLowerCase().trim();
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true, name: true, password: true, isActive: true },
    });

    const message =
      'If an account exists for this email, a password reset link has been sent.';

    if (!user || !user.isActive) {
      return successResponse(res, { message });
    }

    const token = generatePasswordResetToken({
      id: user.id,
      pwd: passwordVersion(user.password),
    });
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const resetUrl = `${frontendUrl.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`;

    await sendEmail({
      to: user.email,
      subject: 'Reset your password',
      text: [
        `Hi ${user.name},`,
        '',
        'We received a request to reset your password.',
        `Open this link to choose a new password: ${resetUrl}`,
        '',
        'This link expires in 15 minutes. If you did not request this, you can ignore this email.',
      ].join('\n'),
    });

    return successResponse(res, { message });
  } catch (error) {
    next(error);
  }
}

async function resetPassword(req, res, next) {
  try {
    const { token, password } = req.body;
    let decoded;

    try {
      decoded = verifyPasswordResetToken(token);
    } catch (error) {
      return errorResponse(res, {
        statusCode: 400,
        message: 'Password reset link is invalid or expired.',
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, password: true, isActive: true },
    });

    if (!user || !user.isActive || decoded.pwd !== passwordVersion(user.password)) {
      return errorResponse(res, {
        statusCode: 400,
        message: 'Password reset link is invalid or expired.',
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword },
      }),
      prisma.refreshToken.deleteMany({
        where: { userId: user.id },
      }),
    ]);

    return successResponse(res, {
      message: 'Password updated successfully. Please log in with your new password.',
    });
  } catch (error) {
    next(error);
  }
}

async function getMe(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true, name: true, email: true, role: true,
        avatar: true, bio: true, headline: true, website: true,
        socialLinks: true, emailVerified: true, isActive: true, createdAt: true,
      },
    });
    return successResponse(res, { data: { user } });
  } catch (error) {
    next(error);
  }
}

async function sendVerificationOTP(email, name, otp) {
  await sendEmail({
    to: email,
    subject: '🛡️ Verify your account',
    // HTML version for modern email clients
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; color: #333333;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h2 style="color: #4F46E5; margin: 0; font-size: 24px;">Account Verification</h2>
        </div>
        
        <p style="font-size: 16px; line-height: 1.5; color: #4B5563;">Hi ${name},</p>
        
        <p style="font-size: 16px; line-height: 1.5; color: #4B5563;">Thank you for registering! Please use the verification code below to complete your account setup:</p>
        
        <div style="text-align: center; margin: 32px 0;">
          <span style="display: inline-block; font-family: monospace; font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #1E1B4B; background-color: #EEF2F6; padding: 12px 24px; border-radius: 6px; border: 1px dashed #CBD5E1;">
            ${otp}
          </span>
        </div>
        
        <p style="font-size: 14px; color: #EF4444; margin-bottom: 24px; font-weight: 500;">
          ⏳ This code will expire in 10 minutes.
        </p>
        
        <hr style="border: 0; border-top: 1px solid #E5E7EB; margin: 24px 0;" />
        
        <p style="font-size: 12px; color: #9CA3AF; line-height: 1.5; margin: 0;">
          If you did not create an account, you can safely ignore this email. Someone may have typed your email address by mistake.
        </p>
      </div>
    `,
    // Fallback plain text version
    text: `
    Hi ${name},

    Thank you for registering! Your verification code is: ${otp}

    This code will expire in 10 minutes.

    If you did not create an account, please ignore this email.
        `,
      });
    }

async function resendOTP(req, res, next) {
  try {
    const { email } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return errorResponse(res, {
        statusCode: 404,
        message: 'User not found.',
      });
    }

    if (user.emailVerified) {
      return errorResponse(res, {
        statusCode: 400,
        message: 'Email already verified.',
      });
    }

    // CHECK LAST OTP TIME
    const latestOtp =
      await prisma.emailVerificationOTP.findFirst({
        where: { email },
        orderBy: {
          createdAt: 'desc',
        },
      });

    if (
      latestOtp &&
      Date.now() - latestOtp.createdAt.getTime() < 60 * 1000
    ) {
      return errorResponse(res, {
        statusCode: 429,
        message: 'Please wait 60 seconds before requesting another OTP.',
      });
    }

    // DELETE OLD OTPs
    await prisma.emailVerificationOTP.deleteMany({
      where: {
        email,
      },
    });

    const otp = generateOTP();

    await prisma.emailVerificationOTP.create({
      data: {
        email,
        otp,
        expiresAt: new Date(
          Date.now() + 10 * 60 * 1000
        ),
      },
    });

    await sendVerificationOTP(
      user.email,
      user.name,
      otp
    );

    return successResponse(res, {
      message: 'OTP sent successfully.',
    });

  } catch (error) {
    next(error);
  }
}

module.exports = {
  registerStudent,
  registerInstructor,
  login,
  refreshToken,
  logout,
  forgotPassword,
  resetPassword,
  getMe,
  sendEmail,
  sendVerificationOTP,
  verifyEmailOTP,
  resendOTP
};
