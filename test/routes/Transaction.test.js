const chai = require("chai");
const chaiHttp = require("chai-http");
const sinon = require("sinon");
const { expect } = chai;
const jwt = require("jsonwebtoken");
const server = require("../../server");
const pool = require("../../db");

chai.use(chaiHttp);

// Helper functions
const mockEmail = "email@email.com";
const mockUserId = 1;
const mockAccountId = 1;
const mockTransactions = [
  { accountId: 1, transactionAmount: 100, description: "Deposit" },
  { accountId: 2, transactionAmount: -50, description: "Withdrawal" },
];

function generateMockToken() {
  return jwt.sign(
    { user: { email: mockEmail, id: mockUserId } },
    "mock-secret",
    {
      expiresIn: "1h",
    }
  );
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

describe("Transaction Routes", () => {
  afterEach(() => {
    sinon.restore(); // Reset stubs and mocks after each test
  });

  describe("GET /api/transaction/:accountId", () => {
    it("should return all transactions for a valid account", async () => {
      const mockToken = generateMockToken();
      mockJwtVerify(mockToken, { user: { email: mockEmail, id: mockUserId } });

      sinon
        .stub(pool, "query")
        .onFirstCall()
        .resolves({ rows: [{ id: mockAccountId }] }) // Valid user check
        .onSecondCall()
        .resolves({ rows: mockTransactions[0] }); // Transactions

      const res = await chai
        .request(server)
        .get(`/api/transaction/${mockAccountId}`)
        .set("Authorization", `Bearer ${mockToken}`);

      expect(res).to.have.status(200);
      expect(res.body).to.deep.equal(mockTransactions[0]);
    });

    it("should return 404 if the user is not authorized for the account", async () => {
      const mockToken = generateMockToken();
      mockJwtVerify(mockToken, { user: { email: mockEmail, id: mockUserId } });

      sinon.stub(pool, "query").resolves({ rows: [] }); // Invalid user check

      const res = await chai
        .request(server)
        .get(`/api/transaction/${mockAccountId}`)
        .set("Authorization", `Bearer ${mockToken}`);

      expect(res).to.have.status(404);
      expect(res.body).to.have.property(
        "error",
        "No Authorized Accounts for this User"
      );
    });

    it("should return 500 for a database error", async () => {
      const mockToken = generateMockToken();
      mockJwtVerify(mockToken, { user: { email: mockEmail, id: mockUserId } });

      sinon.stub(pool, "query").throws(new Error("Database error"));

      const res = await chai
        .request(server)
        .get(`/api/transaction/${mockAccountId}`)
        .set("Authorization", `Bearer ${mockToken}`);

      expect(res).to.have.status(500);
      expect(res.body).to.deep.equal({});
    });
  });

  describe("POST /api/transaction", () => {
    it("should create a transaction for a valid account", async () => {
      const mockToken = generateMockToken();
      mockJwtVerify(mockToken, { user: { email: mockEmail, id: mockUserId } });

      sinon
        .stub(pool, "query")
        .onFirstCall()
        .resolves({ rows: [{ id: mockAccountId }] }) // Valid user check
        .onSecondCall()
        .resolves({ rows: [{ overdraft: true, balance: 700 }] }) // Overdraft check
        .onThirdCall()
        .resolves() // BEGIN
        .onCall(3)
        .resolves() // Insert transaction
        .onCall(4)
        .resolves({ rows: [{balance: 700 }] }) // get balance
        .onCall(5)
        .resolves()// Update balance
        .onCall(6)
        .resolves(); // COMMIT

      const res = await chai
        .request(server)
        .post("/api/transaction")
        .set("Authorization", `Bearer ${mockToken}`)
        .send(mockTransactions[0]);

      expect(res).to.have.status(201);
      expect(res.body).to.have.property(
        "message",
        "Transaction Logged successfully"
      );
    });

    it("should return 401 if overdraft is not allowed and balance is insufficient", async () => {
      const mockToken = generateMockToken();
      mockJwtVerify(mockToken, { user: { email: mockEmail, id: mockUserId } });

      sinon
        .stub(pool, "query")
        .onFirstCall()
        .resolves({ rows: [{ id: 2 }] }) // Valid user check
        .onSecondCall()
        .resolves({ rows: [{ overdraft: false, balance: 10 }] }); // Overdraft check

        const res = await chai
        .request(server)
        .post("/api/transaction")
        .set("Authorization", `Bearer ${mockToken}`)
        .send(mockTransactions[1]);

      expect(res).to.have.status(401);
      expect(res.body).to.have.property(
        "error",
        "Overdraft not allowed on this account. Balance cannot be less than 0"
      );
    });

    it("should return 404 if the user is not authorized for the account", async () => {
      const mockToken = generateMockToken();
      mockJwtVerify(mockToken, { user: { email: mockEmail, id: mockUserId } });

      sinon.stub(pool, "query").resolves({ rows: [] }); // Invalid user check

      const res = await chai
        .request(server)
        .post("/api/transaction")
        .set("Authorization", `Bearer ${mockToken}`)
        .send(mockTransactions[0]);

      expect(res).to.have.status(404);
      expect(res.body).to.have.property(
        "error",
        "No Authorized Accounts for this User"
      );
    });

    it("should return 500 for a database error", async () => {
      const mockToken = generateMockToken();
      mockJwtVerify(mockToken, { user: { email: mockEmail, id: mockUserId } });

      sinon
        .stub(pool, "query")
        .onFirstCall()
        .resolves({ rows: [{ id: mockAccountId }] }) // Valid user check
        .onSecondCall()
        .resolves({ rows: [{ overdraft: true, balance: 500 }] }) // Overdraft check
        .onThirdCall()
        .resolves() // BEGIN
        .onCall(3)
        .resolves() // Insert transaction
        .onCall(4)
        .resolves() // Select balance
        .onCall(5)
        .resolves() // Update balance
        .onCall(6)
        .throws(new Error("Database error"));

      const res = await chai
        .request(server)
        .post("/api/transaction")
        .set("Authorization", `Bearer ${mockToken}`)
        .send(mockTransactions[0]);

      expect(res).to.have.status(500);
      expect(res.body).to.have.property("error", "Error creating transaction");
    });
  });
});
