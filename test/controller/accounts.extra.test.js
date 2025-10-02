const chai = require('chai');
const sinon = require('sinon');
const { expect } = chai;

const AccountsModel = require('../../src/models/Accounts.model');

function mockRes() {
  const res = {};
  res.status = sinon.stub().returns(res);
  res.json = sinon.stub().returns(res);
  return res;
}

const load = () => {
  delete require.cache[require.resolve('../../src/controllers/accounts.controller')];
  return require('../../src/controllers/accounts.controller');
};

describe('Accounts Controller - extra', () => {
  let controller;
  beforeEach(() => controller = load());
  afterEach(() => sinon.restore());

  it('transferOwnership returns 401 when not owner', async () => {
    const req = { body: { accountId: 1, email: 'a@b.com' }, user: { user: { id: 5 } } };
    const res = mockRes();
    sinon.stub(AccountsModel, 'getAccountByOwnerAndId').resolves({ rows: [] });
    await controller.transferOwnership(req, res);
    expect(res.status.calledOnceWith(401)).to.be.true;
  });

  it('transferOwnership returns 403 when target not found', async () => {
    const req = { body: { accountId: 1, email: 'b@b.com' }, user: { user: { id: 5 } } };
    const res = mockRes();
    sinon.stub(AccountsModel, 'getAccountByOwnerAndId').resolves({ rows: [{ id: 1 }] });
    sinon.stub(AccountsModel, 'findAccountUserIdByEmail').resolves({ rows: [] });
    await controller.transferOwnership(req, res);
    expect(res.status.calledOnceWith(403)).to.be.true;
  });

  it('transferOwnership success', async () => {
    const req = { body: { accountId: 1, email: 'b@b.com' }, user: { user: { id: 5 } } };
    const res = mockRes();
    sinon.stub(AccountsModel, 'getAccountByOwnerAndId').resolves({ rows: [{ id: 1 }] });
    sinon.stub(AccountsModel, 'findAccountUserIdByEmail').resolves({ rows: [{ id: 9 }] });
    sinon.stub(AccountsModel, 'begin').resolves();
    sinon.stub(AccountsModel, 'updateOwner').resolves();
    sinon.stub(AccountsModel, 'commit').resolves();
    await controller.transferOwnership(req, res);
    expect(res.status.calledOnceWith(201)).to.be.true;
  });

  it('changeOverdraft unauthorized', async () => {
    const req = { body: { accountId: 1, overdraft: true }, user: { user: { id: 5 } } };
    const res = mockRes();
    sinon.stub(AccountsModel, 'getAccountByOwnerAndId').resolves({ rows: [] });
    await controller.changeOverdraft(req, res);
    expect(res.status.calledOnceWith(401)).to.be.true;
  });

  it('changeOverdraft success', async () => {
    const req = { body: { accountId: 1, overdraft: true }, user: { user: { id: 5 } } };
    const res = mockRes();
    sinon.stub(AccountsModel, 'getAccountByOwnerAndId').resolves({ rows: [{ id: 1 }] });
    sinon.stub(AccountsModel, 'begin').resolves();
    sinon.stub(AccountsModel, 'updateOverdraft').resolves();
    sinon.stub(AccountsModel, 'commit').resolves();
    await controller.changeOverdraft(req, res);
    expect(res.status.calledOnceWith(201)).to.be.true;
  });
});
