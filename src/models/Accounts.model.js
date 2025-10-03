const prisma = require('../prisma/client');

const wrapRows = (data) => {
    if (!data) return { rows: [] };
    if (Array.isArray(data)) {
        return {
            rows: data.map((r) => {
                const out = { ...r };
                if (out.balance && typeof out.balance === 'object' && typeof out.balance.toNumber === 'function') {
                    out.balance = out.balance.toNumber();
                }
                return out;
            }),
        };
    }
    return { rows: [data] };
};

module.exports = {

    getAccountsForUser: async (email) => {
        const rows = await prisma.accounts.findMany({
            where: {
                archived: false,
                account_users: {
                    some: {
                        users: {
                            email,
                            archived: false,
                        },
                    },
                },
            },
            select: {
                id: true,
                name: true,
                balance: true,
            },
        });
        return wrapRows(rows);
    },

    getAccountUsersByAccountId: async (accountId) => {
        const rows = await prisma.account_users.findMany({
            where: { account_id: Number(accountId), archived: Boolean(false) },
        });
        return wrapRows(rows);
    },

    getAccountById: async (accountId) => {
        const row = await prisma.accounts.findUnique({ where: { id: Number(accountId), archived: Boolean(false) } });
        return wrapRows(row);
    },

    insertAccount: async (accountName, ownerId, tx = prisma) => {
        const created = await tx.accounts.create({
            data: { name: accountName, owner: Number(ownerId) },
            select: { id: true },
        });
        return { rows: [{ id: created.id }] };
    },

    insertAccountUser: async (accountId, userId, tx = prisma) => {
        await tx.account_users.create({
            data: { account_id: Number(accountId), user_id: Number(userId) },
        });
        return { rows: [] };
    },

    getAccountOwnerAndBalance: async (userId, accountId) => {
        const rows = await prisma.accounts.findMany({
            where: { owner: Number(userId), id: Number(accountId) },
            select: { balance: true, owner: true, archived: Boolean(false) },
        });
        return wrapRows(rows);
    },

    archiveAccountUsers: async (accountId, tx = prisma) => {
        await tx.account_users.updateMany({
            where: { account_id: Number(accountId) },
            data: { archived: true, update_date: new Date() },
        });
        return { rows: [] };
    },

    archiveAccount: async (accountId, tx = prisma) => {
        await tx.accounts.update({
            where: { id: Number(accountId) },
            data: { archived: true, update_date: new Date() },
        });
        return { rows: [] };
    },

    archiveTransactionsByAccount: async (accountId, tx = prisma) => {
        await tx.transactions.updateMany({
            where: { account_id: Number(accountId) },
            data: { archived: true, update_date: new Date() },
        });
        return { rows: [] };
    },

    getAccountByOwnerAndId: async (userId, accountId) => {
        const rows = await prisma.accounts.findMany({
            where: { owner: Number(userId), archived: false, id: Number(accountId) },
        });
        return wrapRows(rows);
    },

    findUserByEmail: async (email) => {
        const rows = await prisma.users.findMany({ where: { email, archived: false } });
        return wrapRows(rows);
    },

    checkUserHasAccess: async (accountId, userId) => {
        const rows = await prisma.account_users.findMany({
            where: { account_id: Number(accountId), user_id: Number(userId), archived: false },
        });
        return wrapRows(rows);
    },

    findAccountUserIdByEmail: async (accountId, email) => {
        const user = await prisma.users.findFirst({
            where: { email, archived: false, account_users: { some: { account_id: Number(accountId) } } },
            select: { id: true },
        });
        if (!user) return { rows: [] };
        return { rows: [{ id: user.id }] };
    },

    updateOwner: async (newOwnerId, accountId, tx = prisma) => {
        await tx.accounts.update({ where: { id: Number(accountId), archived: Boolean(false)  }, data: { owner: Number(newOwnerId) } });
        return { rows: [] };
    },

    updateOverdraft: async (overdraft, accountId, tx = prisma) => {
        await tx.accounts.update({ where: { id: Number(accountId), archived: Boolean(false)  }, data: { overdraft: Boolean(overdraft) } });
        return { rows: [] };
    },
};
