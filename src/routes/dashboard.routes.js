const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../services/AuthService');
const DashboardController = require('../controllers/dashboard.controller');

router.get('/', authenticateToken, DashboardController.getDashboard);

module.exports = router;
