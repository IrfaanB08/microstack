const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');

// Placeholder for future auth routes
// router.post('/register', authController.register);
// router.post('/login', authController.login);
// router.get('/profile', authMiddleware, authController.getProfile);

module.exports = router;
