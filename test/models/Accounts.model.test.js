const chai = require('chai');
const sinon = require('sinon');
const { expect } = chai;

const prisma = require('../../src/prisma/client');
const AccountsModel = require('../../src/models/Accounts.model');

describe('Accounts Model', () => {
  afterEach(() => sinon.restore());

  it('calls getAccountsForUser with email', async () => {
    sinon.stub(prisma.accounts, 'findMany').resolves([{ id: 1 }]);
    const res = await AccountsModel.getAccountsForUser('a@b.com');
    expect(prisma.accounts.findMany.called).to.be.true;
    expect(res.rows).to.deep.equal([{ id: 1 }]);
  });

  it('propagates errors', async () => {
    sinon.stub(prisma.accounts, 'findUnique').rejects(new Error('boom'));
    try {
      await AccountsModel.getAccountById(1);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err.message).to.equal('boom');
    }
  });
});
