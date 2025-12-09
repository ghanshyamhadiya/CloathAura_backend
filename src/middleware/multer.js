import multer from "multer";
import sharp from "sharp";

const storage = multer.memoryStorage();

// ✅ Accept both images and videos
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
        cb(null, true);
    } else {
        cb(new Error('Only image and video files are allowed!'), false);
    }
};

export const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 50 * 1024 * 1024
    }
});


export const compressedImages = async (req, res, next) => {
    try {
        if (!req.files || req.files.length === 0) {
            console.log('No files to compress');
            return next();
        }

        console.log(`Compressing ${req.files.length} files...`);

        // Process all files in parallel
        const compressionPromises = req.files.map(async (file) => {
            try {
                // Skip non-image files (like videos)
                if (!file.mimetype.startsWith('image/')) {
                    console.log(`Skipping compression for non-image: ${file.originalname}`);
                    return file;
                }

                const originalSize = file.buffer.length;

                // Compress image
                const compressedBuffer = await sharp(file.buffer)
                    .resize(1920, 1920, {
                        fit: 'inside',
                        withoutEnlargement: true
                    })
                    .jpeg({
                        quality: 80,
                        progressive: true
                    })
                    .toBuffer();

                // Update file buffer and mimetype
                file.buffer = compressedBuffer;
                file.mimetype = 'image/jpeg';
                file.size = compressedBuffer.length;

                console.log(`✓ Compressed: ${file.originalname} | ${(originalSize / 1024).toFixed(2)} KB → ${(compressedBuffer.length / 1024).toFixed(2)} KB`);
                
                return file;
            } catch (error) {
                console.error(`Error compressing ${file.originalname}:`, error.message);
                // Return original file if compression fails
                return file;
            }
        });

        await Promise.all(compressionPromises);
        console.log('All files processed successfully');
        
        next();
    } catch (error) {
        console.error("Image compression middleware error:", error);
        return res.status(500).json({
            success: false,
            message: "Image processing failed",
            code: "IMAGE_COMPRESSION_FAILED"
        });
    }
};