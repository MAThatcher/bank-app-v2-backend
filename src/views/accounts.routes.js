const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../services/AuthService');
const AccountsController = require('../controllers/accounts.controller');

//Get All Accounts for User
router.get('/', authenticateToken, AccountsController.getAccounts);
//Get Account by ID
router.get('/:accountId', authenticateToken, AccountsController.getAccountById);
//Create Account
router.post('/', authenticateToken, AccountsController.createAccount);
//Delete Account
router.delete('/:accountId', authenticateToken, AccountsController.deleteAccount);
//Add User to Account
router.post('/:accountId/users', authenticateToken, AccountsController.addUserToAccount);
//Transfer Account Ownership
router.patch('/:accountId/transfer-ownership', authenticateToken, AccountsController.transferOwnership);
//Change Overdraft Limit
router.patch('/:accountId/overdraft', authenticateToken, AccountsController.changeOverdraft);

//TODO
//Remove User from Account
router.delete('/:accountId/users', authenticateToken, AccountsController.removeUserFromAccount);
//Update Account Details
router.patch('/:accountId', authenticateToken, AccountsController.updateAccountDetails);
//Get Account Balance
router.get('/:accountId/balance', authenticateToken, AccountsController.getAccountBalance);


module.exports = router;
