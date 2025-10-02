const chai = require('chai');
const sinon = require('sinon');
const { expect } = chai;

const pool = require('../../src/config/db');
const AccountsModel = require('../../src/models/Accounts.model');

describe('Accounts Model', () => {
  afterEach(() => sinon.restore());

  it('calls getAccountsForUser with email', async () => {
    sinon.stub(pool, 'query').resolves({ rows: [{ id: 1 }] });
    const res = await AccountsModel.getAccountsForUser('a@b.com');
    expect(pool.query.called).to.be.true;
    expect(res.rows).to.deep.equal([{ id: 1 }]);
  });

  it('propagates errors', async () => {
    sinon.stub(pool, 'query').rejects(new Error('boom'));
    try {
      await AccountsModel.getAccountById(1);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err.message).to.equal('boom');
    }
  });
});
