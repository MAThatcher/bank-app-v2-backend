const AccountsModel = require('../models/Accounts.model');
const logger = require('../Utilities/logger');

module.exports = {
    getAccounts: async (req, res) => {
        const rid = req.requestId;
        const userEmail = req.user?.user?.email;

        logger.debug('getAccounts start: %o', { requestId: rid, user: userEmail });

        try {
            logger.debug('getAccounts fetching accounts for user: %o', { requestId: rid, user: userEmail });
            const result = await AccountsModel.getAccountsForUser(userEmail);

            if (result.rows.length === 0) {
                logger.warn('getAccounts no accounts found: %o', { requestId: rid, user: userEmail });
                return res.status(404).json({ error: 'No accounts found for user' });
            }

            logger.info('getAccounts success: %o', { requestId: rid, user: userEmail, accountCount: result.rows.length });
            return res.status(200).json(result.rows);
        } catch (error) {
            logger.error('getAccounts error: %o', { requestId: rid, user: userEmail, error: error });
            return res.status(500).json({ error: 'Server Error' });
        }
    }
    ,

    getAccountById: async (req, res) => {
        const { accountId } = req.params;
        const rid = req.requestId;
        const userEmail = req.user?.user?.email;

        logger.debug('getAccountById start: %o', { requestId: rid, user: userEmail, accountId });

        try {
            logger.debug('getAccountById validating user access: %o', { requestId: rid, accountId, user: userEmail });
            const validUser = await AccountsModel.getAccountUsersByAccountId(accountId);

            if (validUser.rows.length === 0) {
                logger.warn('getAccountById unauthorized or not found: %o', { requestId: rid, accountId, user: userEmail });
                return res.status(404).json({ error: 'Account does not exist or user is not authorized' });
            }

            logger.debug('getAccountById fetching account details: %o', { requestId: rid, accountId, user: userEmail });
            const output = await AccountsModel.getAccountById(accountId);

            if (output.rows.length === 0) {
                logger.warn('getAccountById account details missing: %o', { requestId: rid, accountId, user: userEmail });
                return res.status(404).json({ error: 'Account details not found' });
            }

            logger.info('getAccountById success: %o', { requestId: rid, accountId, user: userEmail });
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

        logger.debug('createAccount start: %o', { requestId: rid, user: userEmail, accountName });
        try {
            logger.debug('createAccount starting transaction: %o', { requestId: rid, user: userEmail, accountName });

            const result = await require('../prisma/client').runTransaction(async (tx) => {
                logger.debug('createAccount inserting new account: %o', { requestId: rid, user: userEmail, accountName });
                const created = await AccountsModel.insertAccount(accountName, userId, tx);

                if (!created.rows[0]?.id) {
                    logger.error('createAccount insertAccount failed: %o', { requestId: rid, user: userEmail, accountName });
                    throw new Error('Account creation failed');
                }

                const accountId = created.rows[0].id;
                logger.debug('createAccount linking user to account: %o', { requestId: rid, user: userEmail, accountId });
                await AccountsModel.insertAccountUser(accountId, userId, tx);

                return accountId;
            });

            logger.info('createAccount success: %o', { requestId: rid, user: userEmail, accountId: result });
            return res.status(201).json({ message: 'Account created successfully', accountId: result });
        } catch (err) {
            logger.error('createAccount error: %o', { requestId: rid, user: userEmail, accountName, error: err });
            return res.status(500).json({ error: 'Error creating account' });
        }
    }
    ,

    deleteAccount: async (req, res) => {
        const rid = req.requestId;
        const { accountId } = req.params;
        const userId = req.user?.user?.id;
        const userEmail = req.user?.user?.email;

        logger.debug('deleteAccount start: %o', { requestId: rid, user: userEmail, accountId });

        try {
            logger.debug('deleteAccount validating ownership and balance: %o', { requestId: rid, user: userEmail, accountId });

            const result = await AccountsModel.getAccountOwnerAndBalance(userId, accountId);

            logger.debug('deleteAccount validating account is found and the user is the owner: %o', { requestId: rid, user: userEmail, accountId });
            if (result.rows.length === 0) {
                logger.warn('deleteAccount account not found or not owner: %o', { requestId: rid, user: userEmail, accountId });
                return res.status(404).json({ error: 'Bank account not found or user is not the owner' });
            }

            const balance = result.rows[0].balance;
            logger.debug('deleteAccount checking account balance: %o', { requestId: rid, user: userEmail, accountId, balance });
            if (balance !== 0.0) {
                logger.warn('deleteAccount balance not zero: %o', { requestId: rid, user: userEmail, accountId, balance });
                return res.status(403).json({ error: 'Bank balance must be 0 to delete account' });
            }

            logger.debug('deleteAccount starting transaction: %o', { requestId: rid, user: userEmail, accountId });
            await require('../prisma/client').runTransaction(async (tx) => {
                logger.debug('deleteAccount archiving account users: %o', { requestId: rid, accountId });
                await AccountsModel.archiveAccountUsers(accountId, tx);

                logger.debug('deleteAccount archiving account: %o', { requestId: rid, accountId });
                await AccountsModel.archiveAccount(accountId, tx);

                logger.debug('deleteAccount archiving transactions: %o', { requestId: rid, accountId });
                await AccountsModel.archiveTransactionsByAccount(accountId, tx);
            });

            logger.info('deleteAccount success: %o', { requestId: rid, user: userEmail, accountId });
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

        logger.debug('addUserToAccount start: %o', { requestId: rid, user: userEmail, accountId, targetEmail: email });

        try {
            logger.debug('addUserToAccount validating account ownership: %o', { requestId: rid, user: userEmail, accountId });
            const result = await AccountsModel.getAccountByOwnerAndId(userId, accountId);

            if (result.rows.length === 0) {
                logger.warn('addUserToAccount unauthorized: %o', { requestId: rid, user: userEmail, accountId });
                return res.status(401).json({ message: 'Unauthorized: Must be account owner to add users' });
            }

            logger.debug('addUserToAccount looking up target user: %o', { requestId: rid, targetEmail: email });
            const newUser = await AccountsModel.findUserByEmail(email);

            if (newUser.rows.length === 0) {
                logger.warn('addUserToAccount target user not found: %o', { requestId: rid, targetEmail: email });
                return res.status(404).json({ message: 'User not found' });
            }

            const newUserId = newUser.rows[0].id;
            logger.debug('addUserToAccount checking existing access: %o', { requestId: rid, accountId, targetUserId: newUserId });
            const hasAccess = await AccountsModel.checkUserHasAccess(accountId, newUserId);

            if (hasAccess.rows.length !== 0) {
                logger.warn('addUserToAccount user already has access: %o', { requestId: rid, accountId, targetUserId: newUserId });
                return res.status(403).json({ message: 'User already has access' });
            }

            logger.debug('addUserToAccount adding user to account: %o', { requestId: rid, accountId, targetUserId: newUserId });
            await require('../prisma/client').runTransaction(async (tx) => {
                await AccountsModel.insertAccountUser(accountId, newUserId, tx);
            });

            logger.info('addUserToAccount success: %o', { requestId: rid, user: userEmail, accountId, targetUserId: newUserId });
            return res.status(201).json({ message: 'User added successfully', accountId, userId: newUserId });
        } catch (err) {
            logger.error('addUserToAccount error: %o', { requestId: rid, user: userEmail, accountId, targetEmail: email, error: err });
            return res.status(500).json({ error: 'Error adding user' });
        }
    }
    ,

    transferOwnership: async (req, res) => {
        const rid = req.requestId;
        const { accountId } = req.params;
        const { email } = req.body;
        const userId = req.user?.user?.id;
        const userEmail = req.user?.user?.email;

        logger.debug('transferOwnership start: %o', { requestId: rid, user: userEmail, accountId, targetEmail: email });

        try {
            logger.debug('transferOwnership validating current owner: %o', { requestId: rid, user: userEmail, accountId });
            const result = await AccountsModel.getAccountByOwnerAndId(userId, accountId);

            if (result.rows.length === 0) {
                logger.warn('transferOwnership unauthorized: %o', { requestId: rid, user: userEmail, accountId });
                return res.status(401).json({ message: 'Unauthorized: Must be account owner to transfer ownership' });
            }

            logger.debug('transferOwnership verifying target user has account access: %o', { requestId: rid, accountId, targetEmail: email });
            const accountUser = await AccountsModel.findAccountUserIdByEmail(accountId, email);

            if (accountUser.rows.length === 0) {
                logger.warn('transferOwnership target user missing access: %o', { requestId: rid, accountId, targetEmail: email });
                return res.status(403).json({ message: 'Target user must already have access to this account to become owner' });
            }

            const targetUserId = accountUser.rows[0].id;
            logger.debug('transferOwnership starting ownership transfer: %o', { requestId: rid, accountId, fromUserId: userId, toUserId: targetUserId });

            await require('../prisma/client').runTransaction(async (tx) => {
                await AccountsModel.updateOwner(targetUserId, accountId, tx);
            });

            logger.info('transferOwnership success: %o', { requestId: rid, accountId, previousOwnerId: userId, newOwnerId: targetUserId });
            return res.status(200).json({ message: 'Account ownership transferred successfully', accountId, newOwnerId: targetUserId });
        } catch (err) {
            logger.error('transferOwnership error: %o', { requestId: rid, user: userEmail, accountId, targetEmail: email, error: err });
            return res.status(500).json({ error: 'Error changing account owner' });
        }
    }
    ,

    changeOverdraft: async (req, res) => {
        const rid = req.requestId;
        const { accountId } = req.params;
        const { overdraft } = req.body;
        const userId = req.user?.user?.id;
        const userEmail = req.user?.user?.email;

        logger.debug('changeOverdraft start: %o', { requestId: rid, user: userEmail, accountId, overdraft });

        try {
            logger.debug('changeOverdraft validating ownership: %o', { requestId: rid, user: userEmail, accountId });
            const result = await AccountsModel.getAccountByOwnerAndId(userId, accountId);

            if (result.rows.length === 0) {
                logger.warn('changeOverdraft unauthorized: %o', { requestId: rid, user: userEmail, accountId });
                return res.status(401).json({ message: 'Unauthorized: Must be account owner to change overdraft' });
            }

            logger.debug('changeOverdraft updating overdraft: %o', { requestId: rid, user: userEmail, accountId, newOverdraft: overdraft });
            await require('../prisma/client').runTransaction(async (tx) => {
                await AccountsModel.updateOverdraft(overdraft, accountId, tx);
            });

            logger.info('changeOverdraft success: %o', { requestId: rid, user: userEmail, accountId, newOverdraft: overdraft });
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
