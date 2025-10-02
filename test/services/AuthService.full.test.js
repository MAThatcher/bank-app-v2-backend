const chai = require('chai');
const sinon = require('sinon');
const jwt = require('jsonwebtoken');
const { expect } = chai;

const pool = require('../../src/config/db');
const AuthService = require('../../src/services/AuthService');

describe('AuthService - full', () => {
  afterEach(() => sinon.restore());

  it('generateRefreshToken returns token and writes to db', () => {
    sinon.stub(jwt, 'sign').returns('rtok');
    sinon.stub(pool, 'query').resolves();
    const res = AuthService.generateRefreshToken({ user: { id: 2 } });
    expect(res).to.equal('rtok');
  });
});
