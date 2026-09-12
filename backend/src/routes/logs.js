const express = require('express');
const router = express.Router();
const logController = require('../controllers/logController');
const authMiddleware = require('../middleware/auth');

// All log routes require authentication
router.use(authMiddleware);

// Today's (or any day's) macros vs targets, plus that day's planned meals
router.get('/summary', logController.getDailySummary);

// List log entries for a given day (defaults to today)
router.get('/', logController.getLogsForDate);

// Log a food entry - manual, or against a specific planned meal
router.post('/', logController.logFood);

// Edit / delete a previously logged entry
router.put('/:id', logController.updateLogEntry);
router.delete('/:id', logController.deleteLogEntry);

module.exports = router;
