const { PrismaClient } = require('@prisma/client');

if (process.env.NODE_ENV === 'test') {
    const noopAsync = async () => { };
    const makeModel = () => ({
        findMany: noopAsync,
        count: noopAsync,
        findUnique: noopAsync,
        findFirst: noopAsync,
        create: noopAsync,
        update: noopAsync,
        updateMany: noopAsync,
        upsert: noopAsync,
    });

    module.exports = {
        accounts: makeModel(),
        account_users: makeModel(),
        users: makeModel(),
        sessions: makeModel(),
        user_preferences: makeModel(),
        disputes: makeModel(),
        audit_logs: makeModel(),
        impersonations: makeModel(),
        dispute_events: makeModel(),
        transactions: makeModel(),
        transfers: makeModel(),
        tokens: makeModel(),
        notifications: makeModel(),
        user_details: makeModel(),
        $queryRaw: noopAsync,

        runTransaction: async (cb) => {
            return await cb(module.exports);
        },
    };
} else {
    const prisma = new PrismaClient();

    prisma.runTransaction = async (cb, options) => {
        return await prisma.$transaction(async (tx) => {
            return await cb(tx);
        }, options);
    };

    module.exports = prisma;
}
