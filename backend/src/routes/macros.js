const express = require('express');
const router = express.Router();
const macroController = require('../controllers/macroController');

// Calculate macro targets based on body stats and goals
router.post('/calculate', macroController.calculateTargets);

module.exports = router;
