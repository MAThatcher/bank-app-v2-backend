const AccountsModel = require('../models/Accounts.model');

module.exports = {
    getAccounts: async (req, res) => {
        try {
            let email = req.user.user.email;
            const result = await AccountsModel.getAccountsForUser(email);
            return res.status(200).json(result.rows);
        } catch (err) {
            console.error(err.message);
            return res.status(500).send('Server Error');
        }
    },

    getAccountById: async (req, res) => {
        const { accountId } = req.params;
        try {
            let validUser = await AccountsModel.getAccountUsersByAccountId(accountId);
            if (validUser.rows.length === 0) {
                return res.status(404).json({ error: 'Account does not exist or user is not authorized' });
            }

            let output = await AccountsModel.getAccountById(accountId);
            return res.status(200).json(output.rows);
        } catch (err) {
            console.error(err.message);
            return res.status(500).send('Server Error');
        }
    },

    createAccount: async (req, res) => {
        const { accountName } = req.body;
        try {
            let userId = req.user.user.id;
            // Run the create account flow inside a prisma transaction. The
            // transaction client `tx` is passed into the model methods so they
            // run against the same transactional context.
            const result = await require('../prisma/client').runTransaction(async (tx) => {
                const created = await AccountsModel.insertAccount(accountName, userId, tx);
                const accountId = created.rows[0].id;
                await AccountsModel.insertAccountUser(accountId, userId, tx);
                return accountId;
            });
            return res.status(201).json({ message: 'Account created successfully', accountId: result });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ error: 'Error creating account' });
        }
    },

    deleteAccount: async (req, res) => {
        const { accountId } = req.params;
        try {
            let userId = req.user.user.id;

            const result = await AccountsModel.getAccountOwnerAndBalance(userId, accountId);
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Bank Account not found or is not the owner of this account' });
            } else if (result.rows[0].balance != 0.0) {
                return res.status(403).json({ error: 'Bank Balance must be 0 to delete.' });
            }

            await require('../prisma/client').runTransaction(async (tx) => {
                await AccountsModel.archiveAccountUsers(accountId, tx);
                await AccountsModel.archiveAccount(accountId, tx);
                await AccountsModel.archiveTransactionsByAccount(accountId, tx);
            });
            return res.status(200).json({ message: 'Account Deleted Successfully' });
        } catch (err) {
            console.error(err.message);
            return res.status(500).send('Server Error');
        }
    },

    addUserToAccount: async (req, res) => {
        const { accountId } = req.params;
        const { email } = req.body;
        try {
            let userId = req.user.user.id;

            const result = await AccountsModel.getAccountByOwnerAndId(userId, accountId);
            if (result.rows.length === 0) {
                return res.status(401).json({ message: 'Unauthorized: Must be accounts owner to add users' });
            }

            let newUser = await AccountsModel.findUserByEmail(email);
            if (newUser.rows.length === 0) {
                return res.status(404).json({ message: 'User Not found' });
            }

            let hasAccess = await AccountsModel.checkUserHasAccess(accountId, newUser.rows[0].id);
            if (hasAccess.rows.length !== 0) {
                return res.status(403).json({ message: 'User has access all ready' });
            }

            await require('../prisma/client').runTransaction(async (tx) => {
                await AccountsModel.insertAccountUser(accountId, newUser.rows[0].id, tx);
            });
            return res.status(201).json({ message: 'User Added successfully', accountId });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ error: 'Error adding user' });
        }
    },

    transferOwnership: async (req, res) => {
        const { accountId } = req.params;
        const { email } = req.body;
        try {
            let userId = req.user.user.id;

            const result = await AccountsModel.getAccountByOwnerAndId(userId, accountId);
            if (result.rows.length === 0) {
                return res.status(401).json({ message: 'Unauthorized: Must be accounts owner change ownership' });
            }

            let accountUser = await AccountsModel.findAccountUserIdByEmail(accountId, email);
            if (accountUser.rows.length === 0) {
                return res.status(403).json({ message: 'User to add must have access to this account to become its owner' });
            }

            await require('../prisma/client').runTransaction(async (tx) => {
                await AccountsModel.updateOwner(accountUser.rows[0].id, accountId, tx);
            });
            return res.status(200).json({ message: 'User owner changed successfully', accountId });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ error: 'Error changing owner' });
        }
    },

    changeOverdraft: async (req, res) => {
        const { accountId } = req.params;
        const { overdraft } = req.body;
        try {
            let userId = req.user.user.id;

            const result = await AccountsModel.getAccountByOwnerAndId(userId, accountId);
            if (result.rows.length === 0) {
                return res.status(401).json({ message: 'Unauthorized: Must be accounts owner to change overdraft' });
            }

            await require('../prisma/client').runTransaction(async (tx) => {
                await AccountsModel.updateOverdraft(overdraft, accountId, tx);
            });
            return res.status(200).json({ message: 'Overdraft changed successfully', accountId });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ error: 'Error changing overdraft' });
        }
    }
};
