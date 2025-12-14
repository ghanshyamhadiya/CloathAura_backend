import express from "express";
import {
    createOrder,
    deleteOrder,
    getAllOrders,
    getDashboardOrders,
    getOrderById,
    getOwnerAnalytics,
    updateOrder,
    getOwnerAnalyticsDetailed
} from "../controllers/order.controller.js";
import { adminOnlyOperations, authenticationToken, ownerAndAdminOperations, ownerOperations } from "../middleware/auth.js";

const router = express.Router();

// Dashboard route - requires authentication and owner/admin role
router.get("/dashboard", authenticationToken, ownerAndAdminOperations, getDashboardOrders);

//admin about owners and all products analytics
router.get("/admin/owner-analytics", authenticationToken, adminOnlyOperations, getOwnerAnalytics);

router.get("/owner/analytics", authenticationToken, ownerOperations, getOwnerAnalyticsDetailed);

// Order management routes
router.post("/", authenticationToken, createOrder);
router.get("/", authenticationToken, ownerAndAdminOperations, getAllOrders);
router.get("/:id", authenticationToken, getOrderById);
router.put("/:id", authenticationToken, ownerAndAdminOperations, updateOrder); 
router.delete("/:id", authenticationToken, deleteOrder);

export default router;