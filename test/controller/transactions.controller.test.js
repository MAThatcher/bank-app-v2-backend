const chai = require('chai');
const sinon = require('sinon');
const { expect } = chai;

const TransactionsModel = require('../../src/models/Transactions.model');

function mockRes() {
  const res = {};
  res.status = sinon.stub().returns(res);
  res.json = sinon.stub().returns(res);
  res.send = sinon.stub().returns(res);
  return res;
}

const load = () => {
  delete require.cache[require.resolve('../../src/controllers/transactions.controller')];
  return require('../../src/controllers/transactions.controller');
};

describe('Transactions Controller', () => {
  let controller;
  beforeEach(() => controller = load());
  afterEach(() => sinon.restore());

  it('getTransactions returns 404 when no access', async () => {
    const req = { params: { accountId: 1 }, user: { user: { id: 5 } } };
    const res = mockRes();
    sinon.stub(TransactionsModel, 'checkUserAccountAccess').resolves({ rows: [] });
    await controller.getTransactions(req, res);
    expect(res.status.calledOnceWith(404)).to.be.true;
  });

  it('getTransactions returns rows', async () => {
    const req = { params: { accountId: 1 }, user: { user: { id: 5 } } };
    const res = mockRes();
    sinon.stub(TransactionsModel, 'checkUserAccountAccess').resolves({ rows: [{ id: 1 }] });
    sinon.stub(TransactionsModel, 'getTransactionsByAccount').resolves({ rows: [{ id: 10 }] });
    await controller.getTransactions(req, res);
    expect(res.json.calledOnce).to.be.true;
  });

  it('createTransaction returns 404 when no access', async () => {
    const req = { body: { accountId: 1, transactionAmount: 10 }, user: { user: { id: 5 } } };
    const res = mockRes();
    sinon.stub(TransactionsModel, 'checkUserAccountAccess').resolves({ rows: [] });
    await controller.createTransaction(req, res);
    expect(res.status.calledOnceWith(404)).to.be.true;
  });

  it('createTransaction returns 401 on overdraft disallowed', async () => {
    const req = { body: { accountId: 1, transactionAmount: -200 }, user: { user: { id: 5 } } };
    const res = mockRes();
    sinon.stub(TransactionsModel, 'checkUserAccountAccess').resolves({ rows: [{ id: 1 }] });
    sinon.stub(TransactionsModel, 'getAccountBalanceAndOverdraft').resolves({ rows: [{ overdraft: false, balance: '50' }] });
    await controller.createTransaction(req, res);
    expect(res.status.calledOnceWith(401)).to.be.true;
  });

  it('createTransaction success', async () => {
    const req = { body: { accountId: 1, transactionAmount: 50, description: 'd' }, user: { user: { id: 5 } } };
    const res = mockRes();
    sinon.stub(TransactionsModel, 'checkUserAccountAccess').resolves({ rows: [{ id: 1 }] });
    sinon.stub(TransactionsModel, 'getAccountBalanceAndOverdraft').resolves({ rows: [{ overdraft: true, balance: '50' }] });
    sinon.stub(TransactionsModel, 'begin').resolves();
    sinon.stub(TransactionsModel, 'insertTransaction').resolves();
    sinon.stub(TransactionsModel, 'getBalanceForAccount').resolves({ rows: [{ balance: '50' }] });
    sinon.stub(TransactionsModel, 'updateAccountBalance').resolves();
    sinon.stub(TransactionsModel, 'commit').resolves();

    await controller.createTransaction(req, res);
    expect(res.status.calledOnceWith(201)).to.be.true;
  });
});
