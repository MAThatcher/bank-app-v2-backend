const chai = require('chai');
const sinon = require('sinon');
const { expect } = chai;

const pool = require('../../src/config/db');
const AuthModel = require('../../src/models/Auth.model');

describe('Auth Model', () => {
  afterEach(() => sinon.restore());

  it('findRefreshToken forwards query result', async () => {
    sinon.stub(pool, 'query').resolves({ rows: [{ valid: true }] });
    const res = await AuthModel.findRefreshToken('r');
    expect(res.rows[0].valid).to.be.true;
  });

  it('findUserByEmailVerified rejects on db error', async () => {
    sinon.stub(pool, 'query').rejects(new Error('db'));
    try {
      await AuthModel.findUserByEmailVerified('x');
      throw new Error('should have failed');
    } catch (err) {
      expect(err.message).to.equal('db');
    }
  });
});
