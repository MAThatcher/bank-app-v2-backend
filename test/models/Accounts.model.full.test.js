const chai = require('chai');
const sinon = require('sinon');
const { expect } = chai;

const prisma = require('../../src/prisma/client');
const AccountsModel = require('../../src/models/Accounts.model');

describe('Accounts Model - full', () => {
  afterEach(() => sinon.restore());

  it('calls lifecycle methods and queries', async () => {
    // stub the Prisma methods our model uses
  sinon.stub(prisma.accounts, 'findMany').resolves([{ id: 1 }]);
  sinon.stub(prisma.account_users, 'findMany').resolves([{ id: 1 }]);
    sinon.stub(prisma.accounts, 'findUnique').resolves({ id: 1 });
    sinon.stub(prisma.accounts, 'create').resolves({ id: 1 });
    sinon.stub(prisma.account_users, 'create').resolves({});
  // reuse prisma.accounts.findMany stub for balance/owner queries by changing its behavior
  prisma.accounts.findMany.resolves([{ balance: 0, owner: 1 }]);
    sinon.stub(prisma.account_users, 'updateMany').resolves({});
    sinon.stub(prisma.accounts, 'update').resolves({});
    sinon.stub(prisma.transactions, 'updateMany').resolves({});
    sinon.stub(prisma.users, 'findMany').resolves([{ id: 2 }]);
  // ensure account_users.findMany can also be used for empty responses later
  prisma.account_users.findMany.resolves([]);

  // legacy lifecycle calls removed

    await AccountsModel.getAccountsForUser('a@b.com');
    await AccountsModel.getAccountUsersByAccountId(1);
    await AccountsModel.getAccountById(1);
    await AccountsModel.insertAccount('n', 1);
    await AccountsModel.insertAccountUser(1, 2);
    await AccountsModel.getAccountOwnerAndBalance(1, 1);
    await AccountsModel.archiveAccountUsers(1);
    await AccountsModel.archiveAccount(1);
    await AccountsModel.archiveTransactionsByAccount(1);
    await AccountsModel.getAccountByOwnerAndId(1, 1);
    await AccountsModel.findUserByEmail('x@y.com');
    await AccountsModel.checkUserHasAccess(1, 2);
    await AccountsModel.findAccountUserIdByEmail(1, 'x@y.com');
    await AccountsModel.updateOwner(2, 1);
    await AccountsModel.updateOverdraft(true, 1);

    // basic assertion that at least one stub was called
    expect(prisma.accounts.findMany.called).to.be.true;
  });
});
