const chai = require('chai');
const sinon = require('sinon');
const { expect } = chai;

const prisma = require('../../src/prisma/client');
const TransactionsModel = require('../../src/models/Transactions.model');

describe('Transactions Model - full', () => {
  afterEach(() => sinon.restore());

  it('calls all exported functions', async () => {
    sinon.stub(prisma.account_users, 'findMany').resolves([{ id: 1 }]);
    sinon.stub(prisma.transactions, 'findMany').resolves([{ id: 1 }]);
    sinon.stub(prisma.transactions, 'create').resolves({});
    sinon.stub(prisma.accounts, 'findUnique').resolves({ overdraft: true, balance: 10 });
    sinon.stub(prisma.accounts, 'update').resolves({});

  // legacy lifecycle calls removed
    await TransactionsModel.checkUserAccountAccess(1, 2);
    await TransactionsModel.getTransactionsByAccount(1);
    await TransactionsModel.insertTransaction(10, 1, 2, 'd');
    await TransactionsModel.getAccountBalanceAndOverdraft(1);
    await TransactionsModel.getBalanceForAccount(1);
    await TransactionsModel.updateAccountBalance(100, 1);

    expect(prisma.transactions.findMany.called).to.be.true;
  });
});
