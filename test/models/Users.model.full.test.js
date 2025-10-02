const chai = require('chai');
const sinon = require('sinon');
const { expect } = chai;

const pool = require('../../src/config/db');
const UsersModel = require('../../src/models/Users.model');

describe('Users Model - full', () => {
  afterEach(() => sinon.restore());

  it('calls all exported functions', async () => {
    sinon.stub(pool, 'query').resolves({ rows: [{ id: 1 }] });

    await UsersModel.begin();
    await UsersModel.commit();
    await UsersModel.rollback();
    await UsersModel.softDeleteUserByEmail('a@b.com');
    await UsersModel.getUserDetailsByEmail('a@b.com');
    await UsersModel.findUserByEmailVerified('a@b.com');
    await UsersModel.findUserByEmail('a@b.com');
    await UsersModel.insertUser('a@b.com', 'h');
    await UsersModel.insertUserDetails(1);
    await UsersModel.setVerifiedByEmail('a@b.com');

    expect(pool.query.called).to.be.true;
  });
});
