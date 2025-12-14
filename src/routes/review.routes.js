import {
    createReview,
    getReviewsByProduct,
    getReviewsByUser,
    updateReview,
    deleteReview
} from "../controllers/review.controller.js";
import multer from "multer";
import express from "express";
import { compressedImages } from "../middleware/multer.js";
import { authenticationToken } from "../middleware/auth.js";

const router = express.Router();

const storage = multer.memoryStorage();

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB per file
        files: 5
    },
    fileFilter: (req, file, cb) => {
        const isImage = file.mimetype.startsWith("image/");
        const isVideo = file.mimetype.startsWith("video/");

        if (isImage || isVideo) {
            cb(null, true);
        } else {
            cb(new Error("Only image and video files are allowed!"), false);
        }
    },
});

// ✅ PUBLIC ROUTE - No authentication required
router.get("/product/:productId", getReviewsByProduct);

// ✅ PROTECTED ROUTES - Authentication required
router.post("/", authenticationToken, upload.array('media', 5), compressedImages, createReview);
router.get("/user", authenticationToken, getReviewsByUser);
router.put("/:id", authenticationToken, upload.array('media', 5), compressedImages, updateReview);
router.delete("/:id", authenticationToken, deleteReview);

export default router;