const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categoryController');

// GET /api/categories/:line_user_id - Get all categories for a user
router.get('/:line_user_id', categoryController.getCategories);

// POST /api/categories/:line_user_id - Create a new category
router.post('/:line_user_id', categoryController.createCategory);

// PUT /api/categories/:line_user_id/:category_id - Update a category
router.put('/:line_user_id/:category_id', categoryController.updateCategory);

// DELETE /api/categories/:line_user_id/:category_id - Delete a category
router.delete('/:line_user_id/:category_id', categoryController.deleteCategory);

// POST /api/categories/:line_user_id/reassign - Reassign transactions between categories
router.post('/:line_user_id/reassign', categoryController.reassignTransactions);

module.exports = router;
