const prisma = require('../prisma/client');

const wrapRows = (data) => {
    if (!data) return { rows: [] };
    if (Array.isArray(data)) return { rows: data };
    return { rows: [data] };
};

module.exports = {

    checkUserAccountAccess: async (userId, accountId) => {
        const rows = await prisma.account_users.findMany({ where: { user_id: Number(userId), account_id: Number(accountId), archived: false }, select: { id: true } });
        return wrapRows(rows);
    },

    getTransactionsByAccount: async (accountId) => {
        const rows = await prisma.transactions.findMany({ where: { account_id: Number(accountId), archived: false }, orderBy: { id: 'desc' }, select: { id: true, create_date: true, account_id: true, description: true, user_id: true, amount: true } });
        return wrapRows(rows);
    },

    insertTransaction: async (amount, userId, accountId, description, tx = prisma) => {
        await tx.transactions.create({ data: { amount, user_id: Number(userId), account_id: Number(accountId), description } });
        return { rows: [] };
    },

    getAccountBalanceAndOverdraft: async (accountId, tx = prisma) => {
        const row = await tx.accounts.findUnique({ where: { id: Number(accountId) }, select: { overdraft: true, balance: true } });
        return wrapRows(row);
    },

    getBalanceForAccount: async (accountId, tx = prisma) => {
        const row = await tx.accounts.findUnique({ where: { id: Number(accountId) }, select: { balance: true } });
        return wrapRows(row);
    },

    updateAccountBalance: async (newBalance, accountId, tx = prisma) => {
        await tx.accounts.update({ where: { id: Number(accountId) }, data: { balance: newBalance } });
        return { rows: [] };
    },
};
