const prisma = require('../prisma/client');

const wrapRows = (data) => {
    if (!data) return { rows: [] };
    if (Array.isArray(data)) return { rows: data };
    return { rows: [data] };
};

module.exports = {
    findRefreshToken: async (refreshToken) => {
        const row = await prisma.tokens.findFirst({
            where: { value: refreshToken, valid: true, type: 'RefreshToken' },
            select: { valid: true },
        });
        return wrapRows(row);
    },

    findUserByEmailVerified: async (email) => {
        const rows = await prisma.users.findMany({ where: { email, archived: false, verified: true } });
        return wrapRows(rows);
    },

    findUserByIdVerified: async (id) => {
        const row = await prisma.users.findUnique({ where: { id: Number(id) } });
        return wrapRows(row);
    },

    updateUserPassword: async (hashedPassword, id) => {
        await prisma.users.update({ where: { id: Number(id) }, data: { password: hashedPassword } });
        return { rows: [] };
    },
};
