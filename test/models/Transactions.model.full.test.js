const chai = require('chai');
const sinon = require('sinon');
const { expect } = chai;

const pool = require('../../src/config/db');
const TransactionsModel = require('../../src/models/Transactions.model');

describe('Transactions Model - full', () => {
  afterEach(() => sinon.restore());

  it('calls all exported functions', async () => {
    sinon.stub(pool, 'query').resolves({ rows: [{ id: 1 }] });

    await TransactionsModel.begin();
    await TransactionsModel.commit();
    await TransactionsModel.rollback();
    await TransactionsModel.checkUserAccountAccess(1, 2);
    await TransactionsModel.getTransactionsByAccount(1);
    await TransactionsModel.insertTransaction(10, 1, 2, 'd');
    await TransactionsModel.getAccountBalanceAndOverdraft(1);
    await TransactionsModel.getBalanceForAccount(1);
    await TransactionsModel.updateAccountBalance(100, 1);

    expect(pool.query.called).to.be.true;
  });
});
