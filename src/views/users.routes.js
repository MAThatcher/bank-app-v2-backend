const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../services/AuthService');
const UsersController = require('../controllers/users.controller');
const SecurityController = require('../controllers/security.controller');
const PreferencesController = require('../controllers/preferences.controller');
router.get('/me/preferences', authenticateToken, PreferencesController.get);
router.put('/me/preferences/notifications', authenticateToken, PreferencesController.notifications);
router.put('/me/preferences/dashboard', authenticateToken, PreferencesController.dashboard);
router.get('/me/sessions', authenticateToken, SecurityController.list);
router.delete('/me/sessions/others', authenticateToken, SecurityController.others);
router.delete('/me/sessions/:sessionId', authenticateToken, SecurityController.revoke);

//Get user details for logged in user
router.get('/', authenticateToken, UsersController.getUserDetails);
//User registration, email verification, deletion
router.post('/', UsersController.register);
router.get('/verify-email/:token', UsersController.verifyEmail);
//Delete user account
router.delete('/', authenticateToken, UsersController.deleteUser);
//TODO
//change user password
router.post('/change-password', authenticateToken, UsersController.changePassword);

// router.get('/me/sessions', authenticateToken, UsersController.getActiveSessions);
// router.delete('/me/sessions/:sessionId', authenticateToken, UsersController.revokeSessionById);
// router.post('/me/2fa/setup', authenticateToken, UsersController.setupTwoFactorAuth);
// router.post('/me/2fa/verify', authenticateToken, UsersController.verifyTwoFactorAuth);
// router.post('/me/2fa/disable', authenticateToken, UsersController.disableTwoFactorAuth);

module.exports = router;
