const prisma = require('../prisma/client');

const wrapRows = (data) => {
    if (!data) return { rows: [] };
    if (Array.isArray(data)) return { rows: data };
    return { rows: [data] };
};

module.exports = {
    getNotificationsForUser: async (userId) => {
        const rows = await prisma.notifications.findMany({ where: { user_id: Number(userId)}, orderBy: { create_date: 'asc' } });
        return wrapRows(rows);
    },

    getNotificationById: async (userId, notificationId) => {
        const row = await prisma.notifications.findFirst({ where: { user_id: Number(userId), id: Number(notificationId)} });
        return wrapRows(row);
    },

    dismissNotification: async (userId, notificationId) => {
        const row = await prisma.notifications.updateMany({ where: { user_id: Number(userId), id: Number(notificationId) }, data: { dismissed: true, update_date: new Date() } });
        return wrapRows(row);
    },

    createNotification: async (message, userId) => {
        const row = await prisma.notifications.create({ data: { message, user_id: Number(userId) } });
        return wrapRows(row);
    },
    dismissAllNotifications: async (userId) => {
        const rows = await prisma.notifications.updateMany({ where: { user_id: Number(userId), dismissed: false }, data: { dismissed: true, update_date: new Date() } });
        return wrapRows(rows);
    },
    getUnreadNotifications: async (userId) => {
        const rows = await prisma.notifications.findMany({ where: { user_id: Number(userId), dismissed: false } });
        return wrapRows(rows);
    },
    getNotificationsByType: async (userId, type) => {
        const rows = await prisma.notifications.findMany({ where: { user_id: Number(userId), type } });
        return wrapRows(rows);
    }
};
