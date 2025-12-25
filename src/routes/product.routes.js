import express from 'express';
import {
    createProduct,
    getAllProducts,
    getProductById,
    updateProduct,
    deleteProduct,
    getProducts,
    getProductBySearch,
    getProductAutocomplete,
    ownerProduct,
    getProductAsCategory
} from '../controllers/product.controller.js';
import { upload } from '../middleware/multer.js';
import {
    authenticationToken,
    ownerAndAdminOperations,
    ownerOperations,
} from '../middleware/auth.js';

const router = express.Router();

// Public routes
router.get('/public', getAllProducts);
router.get('/public/page', getProducts);
router.get('/public/search', getProductBySearch);
router.get('/public/autocomplete', getProductAutocomplete);
router.get('/public/:id', getProductById);
router.get('/public/category/:id', getProductAsCategory);

// Owner-specific route
router.get('/owner/products', authenticationToken,ownerOperations, ownerProduct);

// Protected routes
router.post('/', authenticationToken, ownerAndAdminOperations, upload.any(), createProduct);
router.put('/:id', authenticationToken, ownerAndAdminOperations, upload.any(), updateProduct);
router.delete('/:id', authenticationToken, ownerAndAdminOperations, deleteProduct);

export default router;