const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/auth.controller');
const { authenticateToken } = require('../services/AuthService');

//Generate new access token using refresh token
router.post('/refresh', AuthController.refresh);
//Forgot Password
router.post('/forgot-password', AuthController.forgotPassword);
//Reset Password
router.post('/reset-password', AuthController.resetPassword);
router.post('/login', AuthController.login);
router.post('/logout', authenticateToken, AuthController.logout);

module.exports = router;
