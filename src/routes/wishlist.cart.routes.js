import express from 'express';
import { 
    cartAdd,
    cartRemove,
    cartShow,
    cartUpdateQuantity,
    wishlistAdd,
    wishlistRemove,
    wishlistShow,
    cartClear
} from "../controllers/cart.whislist.controller.js";
import { authenticationToken } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticationToken);

// Cart routes
router.post("/cart/add", cartAdd);
router.put("/cart/update/:itemId", cartUpdateQuantity);
router.delete("/cart/remove/:itemId", cartRemove);
router.delete("/cart/clear", cartClear);
router.get("/cart", cartShow);

// Wishlist routes
router.post("/wishlist/add/:id", wishlistAdd);
router.delete("/wishlist/remove/:id", wishlistRemove);
router.get("/wishlist", wishlistShow);

export default router;