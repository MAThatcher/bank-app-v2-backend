const chai = require("chai");
const chaiHttp = require("chai-http");
const sinon = require("sinon");
const { expect } = chai;
const jwt = require("jsonwebtoken");
const server = require("../../server");
const pool = require("../../db");

chai.use(chaiHttp);

// Helper functions
const mockEmail= "email@email.com";
function generateMockToken() {
  return jwt.sign({ user: { email: mockEmail } }, "mock-secret", {
    expiresIn: "1h",
  });
}
function mockJwtVerify(mockToken, mockUser) {
  sinon.stub(jwt, "verify").callsFake((token, secret, callback) => {
    if (token === mockToken) {
      callback(null, mockUser); // Inject mock user
    } else {
      callback(new Error("Invalid token"));
    }
  });
}

describe("Account Routes", () => {
  afterEach(() => {
    sinon.restore(); // Reset stubs and mocks after each test
  });

  describe("GET /api/account", () => {
    it("should return all accounts for a user", async () => {
      const mockAccounts = [
        { id: 1, name: "Savings", balance: "1000" },
        { id: 2, name: "Checking", balance: "500" },
      ];
      const mockToken = generateMockToken();
      mockJwtVerify(mockToken, { user: { email: mockEmail } });

      sinon.stub(pool, "query").resolves({ rows: mockAccounts });

      const res = await chai
        .request(server)
        .get("/api/account/")
        .set("Authorization", `Bearer ${mockToken}`)
        .send({ mockAccounts });

      expect(res).to.have.status(200);
      expect(res.body).to.deep.equal(mockAccounts);
    });
  });

  describe("GET /api/accounts/:accountId", () => {
    it("should return a single account if the user is authorized", async () => {
      const mockAccountId = 123;
      const mockAccount = [
        { id: mockAccountId, name: "Savings", balance: 1000 },
      ];

      const mockToken = generateMockToken();
      mockJwtVerify(mockToken, { user: { email: mockEmail } });
      sinon
        .stub(pool, "query")
        .onFirstCall()
        .resolves({ rows: [{ valid: true }] }) // Valid user check
        .onSecondCall()
        .resolves({ rows: mockAccount }); // Account details

      const res = await chai
        .request(server)
        .get(`/api/account/${mockAccountId}`)
        .set("Authorization", `Bearer ${mockToken}`)
        .send({ mockAccount });

      expect(res).to.have.status(200);
      expect(res.body).to.deep.equal(mockAccount);
    });

    it("should return 404 if the user is not authorized", async () => {
      const mockAccountId = 123;
      const mockToken = generateMockToken();
      mockJwtVerify(mockToken, { user: { email: mockEmail } });

      sinon.stub(pool, "query").resolves({ rows: [] }); // Invalid user check

      const res = await chai
        .request(server)
        .get(`/api/account/${mockAccountId}`)
        .set("Authorization", `Bearer ${mockToken}`);

      expect(res).to.have.status(404);
      expect(res.body).to.have.property(
        "error",
        "Account does not exist or user is not authorized"
      );
    });
  });

  describe("POST /api/account", () => {
    it("should create a bank account and return 201", async () => {
      const mockAccountId = 123;
      const mockAccountName = "Savings";
      const mockToken = generateMockToken("email@email.com");
      mockJwtVerify(mockToken, { user: { email: mockEmail } });

      sinon
        .stub(pool, "query")
        .onFirstCall()
        .resolves() // BEGIN
        .onSecondCall()
        .resolves({ rows: [{ id: mockAccountId }] }) // Insert account
        .onThirdCall()
        .resolves() // Insert account_users
        .onCall(3)
        .resolves(); // COMMIT

      const res = await chai
        .request(server)
        .post("/api/account")
        .set("Authorization", `Bearer ${mockToken}`)
        .send({ accountName: mockAccountName });

      expect(res).to.have.status(201);
      expect(res.body).to.have.property(
        "message",
        "Account created successfully"
      );
      expect(res.body).to.have.property("accountId", mockAccountId);
    });

    it("should return 500 if account creation fails", async () => {
      const mockAccountName = "Savings";

      const mockToken = generateMockToken();
      mockJwtVerify(mockToken, { user: { email: mockEmail } });

      sinon
        .stub(pool, "query")
        .onFirstCall()
        .resolves() // BEGIN
        .onSecondCall()
        .throws(new Error("Database error")) // Insert account
        .onCall(2)
        .resolves(); // ROLLBACK

      const res = await chai
        .request(server)
        .post("/api/account")
        .set("Authorization", `Bearer ${mockToken}`)
        .send({ accountName: mockAccountName });

      expect(res).to.have.status(500);
      expect(res.body).to.have.property("error", "Error creating account");
    });
  });

  describe("DELETE /api/account", () => {
    it("should delete a bank account if conditions are met", async () => {
      const mockUserId = 1;
      const mockAccountId = 123;

      const mockToken = generateMockToken();
      mockJwtVerify(mockToken, { user: { email: mockEmail } });

      sinon
        .stub(pool, "query")
        .onFirstCall()
        .resolves({ rows: [{ balance: 0, owner: mockUserId }] }) // Account exists and balance is 0
        .onSecondCall()
        .resolves() // BEGIN
        .onThirdCall()
        .resolves() // Update account_users
        .onCall(3)
        .resolves() // Update accounts
        .onCall(4)
        .resolves() // Update transactions
        .onCall(5)
        .resolves(); // COMMIT

      const res = await chai
        .request(server)
        .delete("/api/account")
        .set("Authorization", `Bearer ${mockToken}`)
        .send({ accountId: mockAccountId });

      expect(res).to.have.status(200);
      expect(res.body).to.have.property(
        "message",
        "Account Deleted Successfully"
      );
    });

    it("should return 404 if the account does not exist", async () => {
      const mockAccountId = 123;

      const mockToken = generateMockToken();
      mockJwtVerify(mockToken, { user: { email: mockEmail } });

      sinon.stub(pool, "query").resolves({ rows: [] }); // Account does not exist

      const res = await chai
        .request(server)
        .delete("/api/account")
        .set("Authorization", `Bearer ${mockToken}`)
        .send({ accountId: mockAccountId });

      expect(res).to.have.status(404);
      expect(res.body).to.have.property(
        "error",
        "Bank Account not found or is not the owner of this account"
      );
    });
  });

//   Add tests for /addUser and /transferOwnership routes similarly
});
