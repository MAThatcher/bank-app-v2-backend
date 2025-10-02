const TransactionsModel = require('../models/Transactions.model');

module.exports = {
    getTransactions: async (req, res) => {
        const { accountId } = req.params;
        try {
            let userId = req.user.user.id;
            let validUser = await TransactionsModel.checkUserAccountAccess(userId, accountId);
            if (validUser.rows.length === 0) {
                return res.status(404).json({ error: 'No Authorized Accounts for this User' });
            }
            const result = await TransactionsModel.getTransactionsByAccount(accountId);
            return res.json(result.rows);
        } catch (err) {
            console.error(err.message);
            return res.status(500).send('Server Error');
        }
    },

    createTransaction: async (req, res) => {
        const { transactionAmount, accountId, description } = req.body;
        try {
            let userId = req.user.user.id;

            let validUser = await TransactionsModel.checkUserAccountAccess(userId, accountId);
            if (validUser.rows.length === 0) {
                return res.status(404).json({ error: 'No Authorized Accounts for this User' });
            }

            let check = await TransactionsModel.getAccountBalanceAndOverdraft(accountId);
            let overdraft = check.rows[0].overdraft;
            let balance = parseInt(check.rows[0].balance);
            if (!overdraft && balance + parseInt(transactionAmount) < 0) {
                return res.status(401).json({ error: 'Overdraft not allowed on this account. Balance cannot be less than 0' });
            }

            await TransactionsModel.begin();
            await TransactionsModel.insertTransaction(transactionAmount, userId, accountId, description);
            let newAmount = await TransactionsModel.getBalanceForAccount(accountId);
            newAmount = parseInt(newAmount.rows[0].balance) + parseInt(transactionAmount);
            await TransactionsModel.updateAccountBalance(newAmount, accountId);
            await TransactionsModel.commit();
            return res.status(201).json({ message: 'Transaction Logged successfully' });
        } catch (error) {
            await TransactionsModel.rollback();
            console.error(error);
            return res.status(500).json({ error: 'Error creating transaction' });
        }
    }
};
