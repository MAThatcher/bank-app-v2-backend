const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../services/AuthService');
const AccountsController = require('../controllers/accounts.controller');

router.get('/', authenticateToken, AccountsController.getAccounts);
router.get('/:accountId', authenticateToken, AccountsController.getAccountById);
router.post('/', authenticateToken, AccountsController.createAccount);
router.delete('/:accountId', authenticateToken, AccountsController.deleteAccount);
router.post('/:accountId/users', authenticateToken, AccountsController.addUserToAccount);
router.patch('/:accountId/transfer-ownership', authenticateToken, AccountsController.transferOwnership);
router.patch('/:accountId/overdraft', authenticateToken, AccountsController.changeOverdraft);
//TODO
router.delete('/:accountId/users', authenticateToken, AccountsController.removeUserFromAccount);
router.patch('/:accountId', authenticateToken, AccountsController.updateAccountDetails);
router.get('/:accountId/balance', authenticateToken, AccountsController.getAccountBalance);


module.exports = router;
