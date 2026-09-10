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
        const userId = req.user?.user?.id;
        try {
            if (!Number.isSafeInteger(Number(userId)) || Number(userId) <= 0) {
                return res.status(404).json({ error: 'Account does not exist or user is not authorized' });
            }
            const validUser = await AccountsModel.checkUserHasAccess(accountId, userId);
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

    deleteAccount: require('./vaultSettings.controller').close,
    addUserToAccount: require('./vaultSettings.controller').add,
    transferOwnership: require('./vaultSettings.controller').transfer,
    changeOverdraft: require('./vaultSettings.controller').overdraft,
    removeUserFromAccount: require('./vaultSettings.controller').remove,
    updateAccountDetails: require('./vaultSettings.controller').rename,
    getAccountBalance: async (req, res) => {
        try {
            const access = await AccountsModel.checkUserHasAccess(req.params.accountId, req.user.user.id);
            if (!access.rows.length) return res.status(404).json({ error: 'Vault unavailable.' });
            const result = await AccountsModel.getAccountById(req.params.accountId);
            if (!result.rows.length) return res.status(404).json({ error: 'Vault unavailable.' });
            return res.json({ balance: result.rows[0].balance });
        } catch { return res.status(400).json({ error: 'Invalid vault.' }); }
    },
};
