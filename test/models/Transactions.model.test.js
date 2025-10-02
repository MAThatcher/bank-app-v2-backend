const chai = require('chai');
const sinon = require('sinon');
const { expect } = chai;

const pool = require('../../src/config/db');
const TransactionsModel = require('../../src/models/Transactions.model');

describe('Transactions Model', () => {
  afterEach(() => sinon.restore());

  it('getTransactionsByAccount returns rows', async () => {
    sinon.stub(pool, 'query').resolves({ rows: [{ id: 1 }] });
    const res = await TransactionsModel.getTransactionsByAccount(1);
    expect(res.rows).to.deep.equal([{ id: 1 }]);
  });
});
