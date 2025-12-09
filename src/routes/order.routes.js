import express from "express";
import {
    createOrder,
    deleteOrder,
    getAllOrders,
    getDashboardOrders,
    getOrderById,
    updateOrder
} from "../controllers/order.controller.js";
import { authenticationToken, ownerAndAdminOperations } from "../middleware/auth.js";

const router = express.Router();

router.get("/dashboard", getDashboardOrders); 
router.post("/", authenticationToken, createOrder);
router.get("/", authenticationToken, ownerAndAdminOperations, getAllOrders);
router.get("/:id", authenticationToken, getOrderById);
router.put("/:id", authenticationToken, ownerAndAdminOperations, updateOrder); 
router.delete("/:id", authenticationToken, deleteOrder);
router.get("/:id/track", authenticationToken, getOrderById);

export default router;