const prisma = require('./client');

module.exports = {
  // Mirrors AccountsModel.getAccountsForUser using Prisma query methods.
  getAccountsForUser: async (email) => {
    const rows = await prisma.accounts.findMany({
      where: {
        archived: false,
        account_users: { some: { users: { email, archived: false } } },
      },
      select: { id: true, name: true, balance: true },
    });
    return { rows };
  }
};
