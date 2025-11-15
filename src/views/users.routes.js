const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../services/AuthService');
const UsersController = require('../controllers/users.controller');

//Get user details for logged in user
router.get('/', authenticateToken, UsersController.getUserDetails);
//User login, registration, email verification, deletion
router.post('/login', UsersController.login);
router.post('/', UsersController.register);
router.get('/verify-email/:token', UsersController.verifyEmail);
//Delete user account
router.delete('/', authenticateToken, UsersController.deleteUser);
//TODO
//logout user
router.post('/logout', authenticateToken, UsersController.logout);
//change user password
router.post('/change-password', authenticateToken, UsersController.changePassword);

// router.get('/me/sessions', authenticateToken, UsersController.getActiveSessions);
// router.delete('/me/sessions/:sessionId', authenticateToken, UsersController.revokeSessionById);
// router.post('/me/2fa/setup', authenticateToken, UsersController.setupTwoFactorAuth);
// router.post('/me/2fa/verify', authenticateToken, UsersController.verifyTwoFactorAuth);
// router.post('/me/2fa/disable', authenticateToken, UsersController.disableTwoFactorAuth);

module.exports = router;
