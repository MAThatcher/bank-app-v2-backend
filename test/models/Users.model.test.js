const chai = require('chai');
const sinon = require('sinon');
const { expect } = chai;

const pool = require('../../src/config/db');
const UsersModel = require('../../src/models/Users.model');

describe('Users Model', () => {
  afterEach(() => sinon.restore());

  it('softDeleteUserByEmail calls query', async () => {
    sinon.stub(pool, 'query').resolves();
    await UsersModel.softDeleteUserByEmail('a@b.com');
    expect(pool.query.called).to.be.true;
  });
});
