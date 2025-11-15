const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/auth.controller');

//Generate new access token using refresh token
router.post('/refresh', AuthController.refresh);
//Forgot Password
router.post('/forgot-password', AuthController.forgotPassword);
//Reset Password
router.post('/reset-password', AuthController.resetPassword);

module.exports = router;
