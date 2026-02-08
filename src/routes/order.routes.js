import express from "express";
import {
    createOrder,
    deleteOrder,
    getAllOrders,
    getDashboardOrders,
    getOrderById,
    getUserOrders,
    getOwnerAnalytics,
    updateOrder,
    getOwnerAnalyticsDetailed,
    getOwnerProductInterest
} from "../controllers/order.controller.js";
import { adminOnlyOperations, authenticationToken, ownerAndAdminOperations, ownerOperations } from "../middleware/auth.js";

const router = express.Router();

// Dashboard route - requires authentication and owner/admin role
router.get("/dashboard", authenticationToken, ownerAndAdminOperations, getDashboardOrders);

//admin about owners and all products analytics
router.get("/admin/owner-analytics", authenticationToken, adminOnlyOperations, getOwnerAnalytics);

router.get("/owner/analytics", authenticationToken, ownerOperations, getOwnerAnalyticsDetailed);
router.get("/owner/product-interest", authenticationToken, ownerOperations, getOwnerProductInterest);

// Order management routes
router.post("/", authenticationToken, createOrder);
router.get("/user/me", authenticationToken, getUserOrders);
router.get("/", authenticationToken, ownerAndAdminOperations, getAllOrders);
router.get("/:id", authenticationToken, getOrderById);
router.put("/:id", authenticationToken, ownerAndAdminOperations, updateOrder);
router.delete("/:id", authenticationToken, deleteOrder);

export default router;