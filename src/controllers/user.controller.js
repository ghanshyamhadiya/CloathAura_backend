import crypto from "crypto";
import mongoose from "mongoose";
import { generateToken, verifyToken } from "../utils/jwt.js";
import httpStatus from "http-status";
import User from "../models/user.model.js";
import { sendEmailVerification } from "../utils/sendEmail.js";
import { Coupon } from "../models/coupon.model.js";
import { io } from "../app.js";

const login = async (req, res) => {
    const { username, email, password } = req.body;

    if ((!username && !email) || !password) {
        return res.status(httpStatus.BAD_REQUEST).json({
            success: false,
            message: "Username or email and password are required",
            code: "MISSING_FIELDS"
        });
    }

    try {
        const user = await User.findOne({
            $or: [{ username }, { email }]
        });

        if (!user) {
            return res.status(httpStatus.UNAUTHORIZED).json({
                success: false,
                message: "Invalid username/email or password",
                code: "INVALID_CREDENTIALS"
            });
        }

        if (!(await user.comparePassword(password))) {
            return res.status(httpStatus.UNAUTHORIZED).json({
                success: false,
                message: "Invalid username/email or password",
                code: "INVALID_CREDENTIALS"
            });
        }

        const payload = {
            id: user._id,
            username: user.username,
            email: user.email,
            role: user.role,
        };

        const { accessToken, refreshToken } = generateToken(payload);

        const hashedToken = crypto.createHash("sha256").update(refreshToken).digest("hex");
        user.refreshToken = hashedToken;
        user.lastLoginAt = new Date();
        await user.save();

        res.cookie("refreshToken", refreshToken, {
            httpOnly: true,
            sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
            secure: process.env.NODE_ENV === "production",
            path: "/api/refresh-token",
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        return res.status(httpStatus.OK).json({
            success: true,
            message: "Login successful",
            accessToken
        });
    } catch (error) {
        console.error("Login error:", error);
        return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: "Internal server error",
            code: "INTERNAL_ERROR"
        });
    }
};

const register = async (req, res) => {
    let { username, email, password, role } = req.body;

    if (!username || !email || !password) {
        return res.status(httpStatus.BAD_REQUEST).json({
            success: false,
            message: "Username, email, and password are required",
            code: "MISSING_FIELDS"
        });
    }

    if (!role) {
        role = 'user';
    }

    if (password.length < 6) {
        return res.status(httpStatus.BAD_REQUEST).json({
            success: false,
            message: "Password must be at least 6 characters long",
            code: "INVALID_PASSWORD"
        });
    }

    try {
        const existingUser = await User.findOne({
            $or: [{ username }, { email }]
        });

        if (existingUser) {
            return res.status(httpStatus.CONFLICT).json({
                success: false,
                message: "User with this username or email already exists",
                code: "USER_EXISTS"
            });
        }

        const emailVerificationToken = crypto.randomBytes(32).toString("hex");
        const emailVerificationExpires = Date.now() + 3600000; // 1h

        const newUser = new User({
            username,
            email,
            password,
            role,
            accountCreatedAt: Date.now(),
            emailVerificationToken,
            emailVerificationExpires
        });

        await newUser.save();

        try {
            await sendEmailVerification(email, emailVerificationToken, username);
        } catch (err) {
            console.error("Error sending email:", err.message);
        }

        // Generate tokens first
        const payload = {
            id: newUser._id,
            username: newUser.username,
            email: newUser.email,
            role: newUser.role,
        };

        const { accessToken, refreshToken } = generateToken(payload);
        const hashedToken = crypto.createHash("sha256").update(refreshToken).digest("hex");

        newUser.refreshToken = hashedToken;
        newUser.lastLoginAt = new Date();
        await newUser.save();

        // ✅ FIXED: Assign coupons AFTER user is fully saved
        let welcomeCoupon = null;
        try {
            // ✅ FIXED: Correct method name (singular)
            welcomeCoupon = await Coupon.createWelcomeCoupon(newUser._id);
            
            // Emit socket event AFTER coupon is created
            if (welcomeCoupon) {
                io.to(`user:${newUser._id}`).emit("coupon:assigned", {
                    message: "Welcome coupon assigned",
                    coupon: {
                        code: welcomeCoupon.code,
                        type: welcomeCoupon.type,
                        discountValue: welcomeCoupon.discountValue,
                        validUntil: welcomeCoupon.validUntil,
                    },
                });
            }
        } catch (error) {
            console.error("Error creating welcome coupon:", error);
        }

        try {
            // ✅ FIXED: Correct method name
            const universalCoupons = await Coupon.assignUniversalCouponsToUser(newUser._id);
            
            // Emit socket events AFTER coupons are assigned
            if (universalCoupons && universalCoupons.length > 0) {
                universalCoupons.forEach((coupon) => {
                    io.to(`user:${newUser._id}`).emit("coupon:assigned", {
                        message: "Universal coupon assigned",
                        coupon: {
                            code: coupon.code,
                            type: coupon.type,
                            discountValue: coupon.discountValue,
                            validUntil: coupon.validUntil,
                        },
                    });
                });
            }
        } catch (error) {
            console.error("Error assigning universal coupons:", error);
        }

        res.cookie("refreshToken", refreshToken, {
            httpOnly: true,
            sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
            secure: process.env.NODE_ENV === "production",
            path: "/api/refresh-token",
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        return res.status(httpStatus.CREATED).json({
            success: true,
            message: "User registered successfully",
            accessToken
        });
    } catch (error) {
        console.error("Register error:", error);
        return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: "Internal server error",
            code: "INTERNAL_ERROR"
        });
    }
};

const logout = async (req, res) => {
    const { refreshToken } = req.cookies || req.body;

    try {
        if (refreshToken) {
            const hashedToken = crypto.createHash("sha256").update(refreshToken).digest("hex");
            await User.findOneAndUpdate({ refreshToken: hashedToken }, { refreshToken: null });
        }

        res.clearCookie("refreshToken", {
            httpOnly: true,
            sameSite: "strict",
        });

        return res.status(httpStatus.OK).json({
            success: true,
            message: "Logout successful"
        });
    } catch (error) {
        console.error("Logout error:", error);
        return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: "Internal server error",
            code: "INTERNAL_ERROR"
        });
    }
};

const verifyEmail = async (req, res) => {
    const { token } = req.params;

    try {
        const user = await User.findOne({
            emailVerificationToken: token,
            emailVerificationExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(httpStatus.UNAUTHORIZED).json({
                success: false,
                message: "Invalid or expired email verification token",
                code: "INVALID_TOKEN"
            });
        }

        user.isEmailVerified = true;
        user.emailVerificationToken = undefined;
        user.emailVerificationExpires = undefined;
        await user.save();

        return res.status(httpStatus.OK).json({
            success: true,
            message: "Email verified successfully"
        });
    } catch (error) {
        console.error("Verify email error:", error);
        return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: "Internal server error",
            code: "INTERNAL_ERROR"
        });
    }
};

export const resendEmailVerification = async (req, res) => {
    const userId = req.userId;
    try {
        const user = await User.findById(userId);
        if (!user) {
            return res.status(httpStatus.NOT_FOUND).json({
                success: false,
                message: "User not found",
                code: "USER_NOT_FOUND"
            });
        }

        if (user.isEmailVerified) {
            return res.status(httpStatus.BAD_REQUEST).json({
                success: false,
                message: "Email is already verified",
                code: "EMAIL_ALREADY_VERIFIED"
            });
        }

        const MIN_WAIT_MS = 60 * 1000; // 1 minute
        const now = Date.now();
        const lastSent = user.emailVerificationSentAt ? user.emailVerificationSentAt.getTime() : 0;
        if (now - lastSent < MIN_WAIT_MS) {
            const waitSeconds = Math.ceil((MIN_WAIT_MS - (now - lastSent)) / 1000);
            return res.status(httpStatus.TOO_MANY_REQUESTS).json({
                success: false,
                message: `Please wait ${waitSeconds} second(s) before requesting another verification email`,
                code: "RATE_LIMIT_EXCEEDED"
            });
        }

        const token = crypto.randomBytes(32).toString("hex");
        user.emailVerificationToken = token;
        user.emailVerificationExpires = Date.now() + 15 * 60 * 1000; // 15 minutes
        user.emailVerificationSentAt = new Date();
        user.emailVerificationResendCount = (user.emailVerificationResendCount || 0) + 1;

        await user.save();

        try {
            await sendEmailVerification(user.email, token, user.username);
        } catch (err) {
            console.error("Failed to send verification email:", err);
            return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                message: "Failed to send verification email. Please try again later",
                code: "EMAIL_SEND_FAILED"
            });
        }

        return res.status(httpStatus.OK).json({
            success: true,
            message: "Verification email sent"
        });
    } catch (error) {
        console.error("Resend verification error:", error);
        return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: "Internal server error",
            code: "INTERNAL_ERROR"
        });
    }
};

export const currentUserDetail = async (req, res) => {
    try {
        const userId = req.userId;

        if (!userId) {
            return res.status(httpStatus.UNAUTHORIZED).json({
                success: false,
                message: "User ID not found in token",
                code: "NO_USER_ID"
            });
        }

        const user = await User.findById(userId)
            .select('-password -refreshToken -emailVerificationToken -emailVerificationExpires')
            .lean();

        if (!user) {
            return res.status(httpStatus.NOT_FOUND).json({
                success: false,
                message: "User not found",
                code: "USER_NOT_FOUND"
            });
        }

        res.status(httpStatus.OK).json({
            success: true,
            user: {
                id: user._id.toString(),
                _id: user._id.toString(),
                username: user.username,
                email: user.email,
                role: user.role,
                isEmailVerified: user.isEmailVerified,
                isApproved: user.isApproved,
                accountCreatedAt: user.accountCreatedAt,
                lastLoginAt: user.lastLoginAt,
                addresses: user.addresses || [],
                wishlist: user.wishlist || [],
                cart: user.cart || [],
                emailVerificationSentAt: user.emailVerificationSentAt,
                emailVerificationResendCount: user.emailVerificationResendCount || 0,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt
            }
        });
    } catch (error) {
        console.error("Error fetching user details:", error);
        res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: "Internal server error",
            code: "INTERNAL_ERROR",
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

export const refreshToken = async (req, res) => {
    const incomingRefreshToken = req.cookies?.refreshToken ?? req.body?.refreshToken;

    if (!incomingRefreshToken) {
        return res.status(httpStatus.UNAUTHORIZED).json({
            success: false,
            message: "No refresh token provided",
            code: "NO_TOKEN"
        });
    }

    try {
        const decoded = verifyToken(incomingRefreshToken, "refresh");
        const hashedToken = crypto.createHash("sha256").update(incomingRefreshToken).digest("hex");

        const user = await User.findById(decoded.id);

        if (!user || user.refreshToken !== hashedToken) {
            return res.status(httpStatus.UNAUTHORIZED).json({
                success: false,
                message: "Invalid refresh token",
                code: "INVALID_TOKEN"
            });
        }

        const payload = {
            id: user._id.toString(),
            username: user.username,
            email: user.email,
            role: user.role,
        };

        const { accessToken, refreshToken: newRefreshToken } = generateToken(payload);
        const newHashedToken = crypto.createHash("sha256").update(newRefreshToken).digest("hex");

        user.refreshToken = newHashedToken;
        await user.save();

        res.clearCookie("refreshToken"); // Clear old cookie
        res.cookie("refreshToken", newRefreshToken, {
            httpOnly: true,
            sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
            secure: process.env.NODE_ENV === "production",
            path: "/api/refresh-token",
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        return res.status(httpStatus.OK).json({
            success: true,
            accessToken
        });
    } catch (error) {
        console.error("Refresh token error:", error);
        return res.status(httpStatus.UNAUTHORIZED).json({
            success: false,
            message: error.message || "Token refresh failed",
            code: error.message?.includes('expired') ? 'TOKEN_EXPIRED' : 'REFRESH_FAILED'
        });
    }
};

export {
    login,
    register,
    logout,
    verifyEmail
};