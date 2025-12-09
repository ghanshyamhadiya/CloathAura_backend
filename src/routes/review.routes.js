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

const router = express.Router();

// Configure multer for memory storage
const storage = multer.memoryStorage();

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB per file
        files: 5 // Allow up to 5 files as per your frontend
    },
    fileFilter: (req, file, cb) => { // Fixed: file parameter name was wrong
        const isImage = file.mimetype.startsWith("image/");
        const isVideo = file.mimetype.startsWith("video/");
        
        if (isImage || isVideo) {
            cb(null, true);
        } else {
            cb(new Error("Only image and video files are allowed!"), false);
        }
    },
});

// Routes with proper middleware order
router.post("/", upload.array('media', 5), compressedImages, createReview);
router.get("/product/:productId", getReviewsByProduct);
router.get("/user", getReviewsByUser);
router.put("/:id", upload.array('media', 5), compressedImages, updateReview);
router.delete("/:id", deleteReview);

export default router;