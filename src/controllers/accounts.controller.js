const AccountsModel = require('../models/Accounts.model');
const logger = require('../Utilities/logger');

module.exports = {
    getAccounts: async (req, res) => {
        const rid = req.requestId;
        const userEmail = req.user?.user?.email;
        try {
            const result = await AccountsModel.getAccountsForUser(userEmail);
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'No accounts found for user' });
            }
            return res.status(200).json(result.rows);
        } catch (error) {
            logger.error('getAccounts error: %o', { requestId: rid, user: userEmail, error: error });
            return res.status(500).json({ error: 'Server Error' });
        }
    },

    getAccountById: async (req, res) => {
        const { accountId } = req.params;
        const rid = req.requestId;
        const userEmail = req.user?.user?.email;
        try {
            const validUser = await AccountsModel.getAccountUsersByAccountId(accountId);
            if (validUser.rows.length === 0) {
                return res.status(404).json({ error: 'Account does not exist or user is not authorized' });
            }
            const output = await AccountsModel.getAccountById(accountId);
            if (output.rows.length === 0) {
                return res.status(404).json({ error: 'Account details not found' });
            }
            return res.status(200).json(output.rows[0]);
        } catch (error) {
            logger.error('getAccountById error: %o', { requestId: rid, accountId, user: userEmail, error: error });
            return res.status(500).json({ error: 'Server Error' });
        }
    },


    createAccount: async (req, res) => {
        const { accountName } = req.body;
        const rid = req.requestId;
        const userId = req.user?.user?.id;
        const userEmail = req.user?.user?.email;
        try {
            const result = await require('../prisma/client').runTransaction(async (tx) => {
                const created = await AccountsModel.insertAccount(accountName, userId, tx);
                if (!created.rows[0]?.id) {
                    throw new Error('Account creation failed');
                }
                const accountId = created.rows[0].id;
                await AccountsModel.insertAccountUser(accountId, userId, tx);
                return accountId;
            });
            return res.status(201).json({ message: 'Account created successfully', accountId: result });
        } catch (err) {
            logger.error('createAccount error: %o', { requestId: rid, user: userEmail, accountName, error: err });
            return res.status(500).json({ error: 'Error creating account' });
        }
    },

    deleteAccount: async (req, res) => {
        const rid = req.requestId;
        const { accountId } = req.params;
        const userId = req.user?.user?.id;
        const userEmail = req.user?.user?.email;
        try {
            const result = await AccountsModel.getAccountOwnerAndBalance(userId, accountId);
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Bank account not found or user is not the owner' });
            }
            const balance = result.rows[0].balance;
            if (balance !== 0.0) {
                return res.status(403).json({ error: 'Bank balance must be 0 to delete account' });
            }
            await require('../prisma/client').runTransaction(async (tx) => {
                await AccountsModel.archiveAccountUsers(accountId, tx);
                await AccountsModel.archiveAccount(accountId, tx);
                await AccountsModel.archiveTransactionsByAccount(accountId, tx);
            });
            return res.status(200).json({ message: 'Account deleted successfully' });
        } catch (err) {
            logger.error('deleteAccount error: %o', { requestId: rid, user: userEmail, accountId, error: err });
            return res.status(500).json({ error: 'Server Error' });
        }
    },


    addUserToAccount: async (req, res) => {
        const rid = req.requestId;
        const { accountId } = req.params;
        const { email } = req.body;
        const userId = req.user?.user?.id;
        const userEmail = req.user?.user?.email;
        try {
            const result = await AccountsModel.getAccountByOwnerAndId(userId, accountId);
            if (result.rows.length === 0) {
                return res.status(401).json({ message: 'Unauthorized: Must be account owner to add users' });
            }
            const newUser = await AccountsModel.findUserByEmail(email);
            if (newUser.rows.length === 0) {
                return res.status(404).json({ message: 'User not found' });
            }
            const newUserId = newUser.rows[0].id;
            const hasAccess = await AccountsModel.checkUserHasAccess(accountId, newUserId);
            if (hasAccess.rows.length !== 0) {
                return res.status(403).json({ message: 'User already has access' });
            }
            await require('../prisma/client').runTransaction(async (tx) => {
                await AccountsModel.insertAccountUser(accountId, newUserId, tx);
            });
            return res.status(201).json({ message: 'User added successfully', accountId, userId: newUserId });
        } catch (err) {
            logger.error('addUserToAccount error: %o', { requestId: rid, user: userEmail, accountId, targetEmail: email, error: err });
            return res.status(500).json({ error: 'Error adding user' });
        }
    },

    transferOwnership: async (req, res) => {
        const rid = req.requestId;
        const { accountId } = req.params;
        const { email } = req.body;
        const userId = req.user?.user?.id;
        const userEmail = req.user?.user?.email;
        try {
            const result = await AccountsModel.getAccountByOwnerAndId(userId, accountId);
            if (result.rows.length === 0) {
                return res.status(401).json({ message: 'Unauthorized: Must be account owner to transfer ownership' });
            }
            const accountUser = await AccountsModel.findAccountUserIdByEmail(accountId, email);
            if (accountUser.rows.length === 0) {
                return res.status(403).json({ message: 'Target user must already have access to this account to become owner' });
            }
            const targetUserId = accountUser.rows[0].id;
            await require('../prisma/client').runTransaction(async (tx) => {
                await AccountsModel.updateOwner(targetUserId, accountId, tx);
            });
            return res.status(200).json({ message: 'Account ownership transferred successfully', accountId, newOwnerId: targetUserId });
        } catch (err) {
            logger.error('transferOwnership error: %o', { requestId: rid, user: userEmail, accountId, targetEmail: email, error: err });
            return res.status(500).json({ error: 'Error changing account owner' });
        }
    },

    changeOverdraft: async (req, res) => {
        const rid = req.requestId;
        const { accountId } = req.params;
        const { overdraft } = req.body;
        const userId = req.user?.user?.id;
        const userEmail = req.user?.user?.email;
        try {
            const result = await AccountsModel.getAccountByOwnerAndId(userId, accountId);
            if (result.rows.length === 0) {
                return res.status(401).json({ message: 'Unauthorized: Must be account owner to change overdraft' });
            }
            await require('../prisma/client').runTransaction(async (tx) => {
                await AccountsModel.updateOverdraft(overdraft, accountId, tx);
            });
            return res.status(200).json({ message: 'Overdraft changed successfully', accountId, overdraft });
        } catch (err) {
            logger.error('changeOverdraft error: %o', { requestId: rid, user: userEmail, accountId, overdraft, error: err });
            return res.status(500).json({ error: 'Error changing overdraft' });
        }
    },

    //TODO
    removeUserFromAccount: async (req, res) => {
        return res.status(501).json({ error: 'Not Implemented' });
    },
    updateAccountDetails: async (req, res) => {
        return res.status(501).json({ error: 'Not Implemented' });
    },
    getAccountBalance: async (req, res) => {
        return res.status(501).json({ error: 'Not Implemented' });
    }
};
