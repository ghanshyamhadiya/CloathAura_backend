import { verifyToken } from "../utils/jwt.js";
import httpStatus from "http-status";
import User from "../models/user.model.js";
import rateLimit from "express-rate-limit";

export const emailVerificationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: {
    success: false,
    message: "Too many requests from this IP, please try again after a minute",
    code: "RATE_LIMIT_EXCEEDED"
  }
});

export const authenticationToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(httpStatus.UNAUTHORIZED).json({
        success: false,
        message: "Authorization header missing",
        code: "NO_AUTH_HEADER",
      });
    }

    const tokenParts = authHeader.split(" ");
    if (tokenParts.length !== 2 || tokenParts[0] !== "Bearer") {
      return res.status(httpStatus.UNAUTHORIZED).json({
        success: false,
        message: "Invalid authorization header format",
        code: "INVALID_AUTH_FORMAT",
      });
    }

    const token = tokenParts[1];
    if (!token) {
      return res.status(httpStatus.UNAUTHORIZED).json({
        success: false,
        message: "No token provided",
        code: "NO_TOKEN",
      });
    }

    let decoded;
    try {
      decoded = verifyToken(token, "access");
    } catch (verifyError) {
      return res.status(httpStatus.UNAUTHORIZED).json({
        success: false,
        message: verifyError.message === "Token has expired" ? "Token has expired" : "Invalid token",
        code: verifyError.message === "Token has expired" ? "TOKEN_EXPIRED" : "INVALID_TOKEN",
      });
    }

    const user = await User.findById(decoded.id)
      .select("-password -refreshToken -emailVerificationToken")
      .lean();

    if (!user) {
      return res.status(httpStatus.UNAUTHORIZED).json({
        success: false,
        message: "User not found",
        code: "USER_NOT_FOUND",
      });
    }

    if (user.accountStatus === "suspended" || user.accountStatus === "deleted") {
      return res.status(httpStatus.FORBIDDEN).json({
        success: false,
        message: "Account is suspended or deactivated",
        code: "ACCOUNT_SUSPENDED",
      });
    }

    req.userId = decoded.id;
    req.userRole = user.role;
    req.user = {
      ...user,
      _id: user._id.toString(),
      id: user._id.toString(),
    };
    req.tokenData = decoded;

    next();
  } catch (error) {
    console.error("Authentication middleware error:", error);
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Authentication service error",
      code: "AUTH_SERVICE_ERROR",
    });
  }
};

// Modified socketAuth to allow guest connections
export const socketAuth = async (socket, next) => {
  try {
    let token = socket.handshake?.auth?.token;
    if (!token) {
      const authHeader = socket.handshake?.headers?.authorization;
      if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        token = authHeader.split(" ")[1];
      }
    }

    // If no token, allow connection as guest
    if (!token) {
      console.log('Socket connecting as guest (no token)');
      socket.isGuest = true;
      return next();
    }

    // If token provided, validate it
    let decoded;
    try {
      decoded = verifyToken(token, "access");
    } catch (err) {
      if (err.message === "Token has expired") {
        console.log('Socket token expired, connecting as guest');
        socket.isGuest = true;
        return next();
      }
      console.log('Invalid socket token, connecting as guest');
      socket.isGuest = true;
      return next();
    }

    const user = await User.findById(decoded.id).select("-password -refreshToken").lean();
    if (!user) {
      console.log('User not found for socket, connecting as guest');
      socket.isGuest = true;
      return next();
    }
    
    if (user.accountStatus === "suspended" || user.accountStatus === "deleted") {
      console.log('User account suspended, connecting as guest');
      socket.isGuest = true;
      return next();
    }

    // Authenticated connection
    socket.userId = decoded.id;
    socket.user = { ...user, _id: user._id.toString(), id: user._id.toString() };
    socket.userRole = user.role;
    socket.isGuest = false;

    return next();
  } catch (err) {
    console.error("Socket authentication error:", err);
    // On error, allow as guest rather than blocking
    socket.isGuest = true;
    return next();
  }
};

const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !req.userRole) {
      return res.status(httpStatus.UNAUTHORIZED).json({
        success: false,
        message: "User not authenticated",
        code: "UNAUTHORIZED"
      });
    }

    if (!allowedRoles.includes(req.userRole)) {
      return res.status(httpStatus.FORBIDDEN).json({
        success: false,
        message: `User not authorized only allowed for ${allowedRoles.join(", ")}`,
        code: "INSUFFICIENT_PERMISSIONS"
      });
    }

    next();
  };
};

export const adminOnlyOperations = authorizeRoles("admin");
export const ownerAndAdminOperations = authorizeRoles("owner", "admin");
export const ownerOperations = authorizeRoles("owner");
export const userOperations = authorizeRoles("user");