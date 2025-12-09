import express from "express";
import {
    currentUserDetail,
    login,
    logout,
    refreshToken,
    register,
    verifyEmail,
    resendEmailVerification,
} from "../controllers/user.controller.js";
import {
    authenticationToken,
    emailVerificationLimiter
} from "../middleware/auth.js";
import {
    updateUserAddress,
    getUserAddresses,
    addUserAddress,
    deleteUserAddress,
    setDefaultAddress,
} from "../controllers/address.controller.js";

const router = express.Router();

// Auth routes (public)
router.post("/login", login);
router.post("/register", register);
router.post("/refresh-token", refreshToken);
router.get("/verify-email/:token", verifyEmail);
router.post("/logout", logout);

router.post("/resend-verifiaction", emailVerificationLimiter, authenticationToken, resendEmailVerification);

// Protected route for user details
router.get("/me", authenticationToken, currentUserDetail);

// Address Routes (all protected)
router.get("/address", authenticationToken, getUserAddresses);
router.post("/address", authenticationToken, addUserAddress);
router.put("/address/:addressId", authenticationToken, updateUserAddress);
router.delete("/address/:addressId", authenticationToken, deleteUserAddress);
router.put('/address/default/:addressId', authenticationToken, setDefaultAddress);

export default router;