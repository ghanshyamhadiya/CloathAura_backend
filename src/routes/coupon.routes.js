import express from 'express';
import {
  createCoupon,
  getAllCoupons,
  getUserCoupons,
  validateCoupon,
  updateCoupon,
  deleteCoupon,
  assignCouponToUser,
  getCouponAnalytics
} from '../controllers/coupon.controller.js';
import { authenticationToken, ownerAndAdminOperations } from '../middleware/auth.js';
import { emailVerificationLimiter } from '../middleware/auth.js'; // Assuming this can be reused

const router = express.Router();

// Public route (no auth)
router.get('/available', getAllCoupons);

// Authenticated routes
router.get('/user-coupons', authenticationToken, getUserCoupons);
router.post('/validate', authenticationToken, emailVerificationLimiter, validateCoupon);

// Owner/Admin only routes
router.post('/create', authenticationToken, ownerAndAdminOperations, createCoupon);
router.get('/all', authenticationToken, ownerAndAdminOperations, getAllCoupons);
router.put('/:id', authenticationToken, ownerAndAdminOperations, updateCoupon);
router.delete('/:id', authenticationToken, ownerAndAdminOperations, deleteCoupon);
router.post('/assign', authenticationToken, ownerAndAdminOperations, assignCouponToUser);
router.get('/analytics/:couponId', authenticationToken, ownerAndAdminOperations, getCouponAnalytics);

// Test route
router.get('/test-public', (req, res) => {
  res.json({ success: true, msg: "No auth required" });
});

export default router;