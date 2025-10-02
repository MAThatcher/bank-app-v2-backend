const chai = require('chai');
const sinon = require('sinon');
const { expect } = chai;

const pool = require('../../src/config/db');
const AccountsModel = require('../../src/models/Accounts.model');

describe('Accounts Model - full', () => {
  afterEach(() => sinon.restore());

  it('calls lifecycle methods and queries', async () => {
    sinon.stub(pool, 'query').resolves({ rows: [{ id: 1 }] });

    await AccountsModel.begin();
    await AccountsModel.commit();
    await AccountsModel.rollback();

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

    expect(pool.query.callCount).to.be.greaterThan(0);
  });
});
