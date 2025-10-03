const prisma = require('../prisma/client');

const wrapRows = (data) => {
    if (!data) return { rows: [] };
    if (Array.isArray(data)) return { rows: data };
    return { rows: [data] };
};

module.exports = {
    // Legacy lifecycle methods removed; use prisma.runTransaction and pass
    // `tx` into model functions when transactional behavior is required.

    softDeleteUserByEmail: async (email, tx = prisma) => {
        await tx.users.updateMany({ where: { email }, data: { email: null, archived: true, archived_email: email, super_user: false, password: 'DELETED', update_date: new Date() } });
        return { rows: [] };
    },

    getUserDetailsByEmail: async (email) => {
        const rows = await prisma.users.findMany({ where: { email, archived: false }, select: { id: true, email: true, create_date: true, update_date: true, super_user: true } });
        return wrapRows(rows);
    },

    findUserByEmailVerified: async (email) => {
        const rows = await prisma.users.findMany({ where: { email, verified: true }, select: { id: true, email: true, password: true, super_user: true } });
        return wrapRows(rows);
    },

    findUserByEmail: async (email) => {
        const rows = await prisma.users.findMany({ where: { email } });
        return wrapRows(rows);
    },

    insertUser: async (email, hashedPassword, tx = prisma) => {
        const created = await tx.users.create({ data: { email, password: hashedPassword }, select: { id: true } });
        return { rows: [{ id: created.id }] };
    },

    insertUserDetails: async (userId, tx = prisma) => {
        await tx.user_details.create({ data: { user_id: Number(userId) } });
        return { rows: [] };
    },

    setVerifiedByEmail: async (email, tx = prisma) => {
        await tx.users.updateMany({ where: { email }, data: { verified: true } });
        return { rows: [] };
    },
};

