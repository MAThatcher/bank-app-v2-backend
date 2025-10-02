const chai = require('chai');
const sinon = require('sinon');
const jwt = require('jsonwebtoken');
const { expect } = chai;

const pool = require('../../src/config/db');
const AuthService = require('../../src/services/AuthService');

describe('AuthService', () => {
  afterEach(() => sinon.restore());

  it('generateAccessToken returns token and writes to db', () => {
    sinon.stub(jwt, 'sign').returns('tok');
    sinon.stub(pool, 'query').resolves();
    const res = AuthService.generateAccessToken({ user: { id: 1 } });
    expect(res).to.equal('tok');
    expect(pool.query.called).to.be.true;
  });

  it('generateAccessToken handles errors and returns null', () => {
    sinon.stub(jwt, 'sign').throws(new Error('bad'));
    sinon.stub(pool, 'query').resolves();
    const res = AuthService.generateAccessToken({ user: { id: 1 } });
    expect(res).to.equal(null);
  });
});
