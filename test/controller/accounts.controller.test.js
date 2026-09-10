const chai = require('chai');
const sinon = require('sinon');
const { expect } = chai;

const AccountsModel = require('../../src/models/Accounts.model');

function mockRes() {
  const res = {};
  res.status = sinon.stub().returns(res);
  res.json = sinon.stub().returns(res);
  res.send = sinon.stub().returns(res);
  return res;
}

const loadController = () => {
  delete require.cache[require.resolve('../../src/controllers/accounts.controller')];
  return require('../../src/controllers/accounts.controller');
};

describe('Accounts Controller', () => {
  let controller;

  beforeEach(() => {
    controller = loadController();
  });
  afterEach(() => sinon.restore());

  it('getAccounts returns rows', async () => {
    const req = { user: { user: { email: 'a@b.com' } } };
    const res = mockRes();
    sinon.stub(AccountsModel, 'getAccountsForUser').resolves({ rows: { id: 1 } });

    await controller.getAccounts(req, res);
    expect(res.json.calledOnce).to.be.true;
    expect(res.json.firstCall.args[0]).to.deep.equal({ id: 1 });
  });

  it('getAccounts handles error', async () => {
    const req = { user: { user: { email: 'a@b.com' } } };
    const res = mockRes();
    sinon.stub(AccountsModel, 'getAccountsForUser').throws(new Error('db'));

    await controller.getAccounts(req, res);
    expect(res.status.calledOnceWith(500)).to.be.true;
  });

  it('getAccountById returns 404 when not authorized', async () => {
    const req = { params: { accountId: 1 }, user: { user: { id: 7 } } };
    const res = mockRes();
    sinon.stub(AccountsModel, 'checkUserHasAccess').resolves({ rows: [] });

    await controller.getAccountById(req, res);
    expect(res.status.calledOnceWith(404)).to.be.true;
  });

  it('getAccountById returns account rows', async () => {
    const req = { params: { accountId: 1 }, user: { user: { id: 7 } } };
    const res = mockRes();
    sinon.stub(AccountsModel, 'checkUserHasAccess').resolves({ rows: [{ valid: true }] });
    sinon.stub(AccountsModel, 'getAccountById').resolves({ rows: [{ id: 1 }] });

    await controller.getAccountById(req, res);
    expect(res.status.calledOnceWith(200)).to.be.true;
    expect(res.json.firstCall.args[0]).to.deep.equal({ id: 1 });
  });

  it('createAccount success', async () => {
    const req = { body: { accountName: 'S' }, user: { user: { id: 5 } } };
    const res = mockRes();
    sinon.stub(AccountsModel, 'insertAccount').resolves({ rows: [{ id: 10 }] });
    sinon.stub(AccountsModel, 'insertAccountUser').resolves();
    const prisma = require('../../src/prisma/client');
    sinon.stub(prisma, 'runTransaction').resolves(10);

    await controller.createAccount(req, res);
    expect(res.status.calledOnceWith(201)).to.be.true;
    expect(res.json.firstCall.args[0]).to.have.property('accountId', 10);
  });

  it('createAccount rolls back on error', async () => {
    const req = { body: { accountName: 'S' }, user: { user: { id: 5 } } };
    const res = mockRes();
    const prisma = require('../../src/prisma/client');
    sinon.stub(AccountsModel, 'insertAccount').throws(new Error('db'));
    sinon.stub(prisma, 'runTransaction').rejects(new Error('db'));

    await controller.createAccount(req, res);
    expect(prisma.runTransaction.calledOnce).to.be.true;
    expect(res.status.calledOnceWith(500)).to.be.true;
  });

});
