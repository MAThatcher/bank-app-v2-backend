const chai = require("chai");
const sinon = require("sinon");
const jwt = require("jsonwebtoken");
const { expect } = chai;
const pool = require("../../db");
const {
  generateAccessToken,
  generateRefreshToken,
  authenticateToken,
} = require("../../services/AuthService");

describe("AuthService", () => {
  afterEach(() => {
    sinon.restore(); // Reset stubs and mocks after each test
  });

  describe("generateAccessToken", () => {
    it("should generate a valid access token and update the database", async () => {
      const mockUser = { user: { id: 1, email: "test@example.com" } };
      const mockToken = "mockAccessToken";

      sinon.stub(jwt, "sign").returns(mockToken);
      const poolStub = sinon.stub(pool, "query");

      const token = generateAccessToken(mockUser);

      expect(token).to.equal(mockToken);
      expect(poolStub.callCount).to.equal(4); // BEGIN, update, insert, COMMIT
      expect(poolStub.firstCall.args[0]).to.equal("BEGIN");
      expect(poolStub.secondCall.args[0]).to.include(
        "update tokens set valid = false"
      );
      expect(poolStub.thirdCall.args[0]).to.include("insert into tokens");
    });

    it("should return null and rollback on error", async () => {
      const mockUser = { user: { id: 1, email: "test@example.com" } };

      sinon.stub(jwt, "sign").throws(new Error("Token generation error"));
      const poolStub = sinon.stub(pool, "query");

      const token = generateAccessToken(mockUser);

      expect(token).to.be.null;
      expect(poolStub.callCount).to.equal(1); // BEGIN, ROLLBACK
      expect(poolStub.firstCall.args[0]).to.equal("ROLLBACK");
    });
  });

  describe("generateRefreshToken", () => {
    it("should generate a valid refresh token and update the database", async () => {
      const mockUser = { user: { id: 1, email: "test@example.com" } };
      const mockToken = "mockRefreshToken";

      sinon.stub(jwt, "sign").returns(mockToken);
      const poolStub = sinon.stub(pool, "query");

      const token = generateRefreshToken(mockUser);

      expect(token).to.equal(mockToken);
      expect(poolStub.callCount).to.equal(4); // BEGIN, update, insert, COMMIT
      expect(poolStub.firstCall.args[0]).to.equal("BEGIN");
      expect(poolStub.secondCall.args[0]).to.include(
        "update tokens set valid = false"
      );
      expect(poolStub.thirdCall.args[0]).to.include("insert into tokens");
    });

    it("should return null and rollback on error", async () => {
      const mockUser = { user: { id: 1, email: "test@example.com" } };

      sinon.stub(jwt, "sign").throws(new Error("Token generation error"));
      const poolStub = sinon.stub(pool, "query");

      const token = generateRefreshToken(mockUser);

      expect(token).to.be.null;
      expect(poolStub.callCount).to.equal(1); // BEGIN, ROLLBACK
      expect(poolStub.firstCall.args[0]).to.equal("ROLLBACK");
    });
  });

  describe("authenticateToken", () => {
    it("should authenticate a valid token and attach the user to the request", () => {
      const mockToken = "mockValidToken";
      const mockUser = { id: 1, email: "test@example.com" };

      sinon.stub(jwt, "verify").callsFake((token, secret, callback) => {
        callback(null, mockUser);
      });

      const req = { headers: { authorization: `Bearer ${mockToken}` } };
      const res = {};
      const next = sinon.spy();

      authenticateToken(req, res, next);

      expect(req.user).to.deep.equal(mockUser);
      expect(next.calledOnce).to.be.true;
    });

    it("should return 401 if no token is provided", () => {
      const req = { headers: {} };
      const res = { status: sinon.stub().returnsThis(), json: sinon.spy() };
      const next = sinon.spy();

      authenticateToken(req, res, next);

      expect(res.status.calledWith(401)).to.be.true;
      expect(res.json.calledWith({ error: "Access token required" })).to.be
        .true;
      expect(next.called).to.be.false;
    });

    it("should return 403 if the token is invalid or expired", () => {
      const mockToken = "mockInvalidToken";

      sinon.stub(jwt, "verify").callsFake((token, secret, callback) => {
        callback(new Error("Invalid token"));
      });

      const req = { headers: { authorization: `Bearer ${mockToken}` } };
      const res = { status: sinon.stub().returnsThis(), json: sinon.spy() };
      const next = sinon.spy();

      authenticateToken(req, res, next);

      expect(res.status.calledWith(403)).to.be.true;
      expect(res.json.calledWith({ error: "Invalid or expired token" })).to.be
        .true;
      expect(next.called).to.be.false;
    });
  });
});
