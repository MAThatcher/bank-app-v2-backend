const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/auth.controller');

router.post('/refresh', AuthController.refresh);
router.post('/forgot-password', AuthController.forgotPassword);
router.post('/reset-password', AuthController.resetPassword);

module.exports = router;
