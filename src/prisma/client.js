const { PrismaClient } = require('@prisma/client');

if (process.env.NODE_ENV === 'test') {
    const noopAsync = async () => { };
    const makeModel = () => ({
        findMany: noopAsync,
        findUnique: noopAsync,
        findFirst: noopAsync,
        create: noopAsync,
        update: noopAsync,
        updateMany: noopAsync,
    });

    module.exports = {
        accounts: makeModel(),
        account_users: makeModel(),
        users: makeModel(),
        transactions: makeModel(),
        tokens: makeModel(),
        notifications: makeModel(),
        user_details: makeModel(),

        runTransaction: async (cb) => {
            return await cb(module.exports);
        },
    };
} else {
    const prisma = new PrismaClient();

    prisma.runTransaction = async (cb) => {
        return await prisma.$transaction(async (tx) => {
            return await cb(tx);
        });
    };

    module.exports = prisma;
}
