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
const mockAccountUsers = [
  { id: 1, user_id: 1, account_id: 1 },
  { id: 2, user_id: 2, account_id: 1 },
];
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
    it("should return 500 for a database error", async () => {
      const mockToken = generateMockToken();
      mockJwtVerify(mockToken, { user: { email: mockEmail } });

      sinon.stub(pool, "query").throws(new Error("Database error"));
      const res = await chai
        .request(server)
        .get("/api/account/")
        .set("Authorization", `Bearer ${mockToken}`)
        .send({ mockAccountId });

      expect(res).to.have.status(500);
      expect(res.body).to.deep.equal({});
    });
  });

  describe("GET /api/account/:accountId", () => {
    it("should return a single account if the user is authorized", async () => {
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
    it("should return 500 for a database error", async () => {
      const mockToken = generateMockToken();
      mockJwtVerify(mockToken, { user: { email: mockEmail } });

      sinon.stub(pool, "query").throws(new Error("Database error"));
      const res = await chai
        .request(server)
        .get(`/api/account/${mockAccountId}`)
        .set("Authorization", `Bearer ${mockToken}`)
        .send({ mockAccountId });

      expect(res).to.have.status(500);
      expect(res.body).to.deep.equal({});
    });
  });

  describe("POST /api/account", () => {
    it("should create a bank account and return 201", async () => {
      const mockAccountName = "Savings";
      const mockToken = generateMockToken(mockEmail);
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
    it("should return 500 for a database error", async () => {
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
        .throws(new Error("Database error")); // Update accounts

      const res = await chai
        .request(server)
        .delete("/api/account")
        .set("Authorization", `Bearer ${mockToken}`)
        .send({ mockAccountId });

      expect(res).to.have.status(500);
      expect(res.body).to.deep.equal({});
    });

    it("should return 404 if the account does not exist", async () => {
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
    it("should return 401  if the bank balance !=0", async () => {
      const mockToken = generateMockToken();
      mockJwtVerify(mockToken, { user: { email: mockEmail } });

      sinon
        .stub(pool, "query")
        .onFirstCall()
        .resolves({ rows: [{ balance: 15, owner: mockUserId }] });

      const res = await chai
        .request(server)
        .delete("/api/account")
        .set("Authorization", `Bearer ${mockToken}`)
        .send({ accountId: mockAccountId });

      expect(res).to.have.status(401);
      expect(res.body).to.have.property(
        "error",
        "Bank Balance must be 0 to delete."
      );
    });
  });

  describe("POST /api/account/addUser", () => {
    it("should add an authorized user to list of account users.", async () => {
      const mockToken = generateMockToken();
      mockJwtVerify(mockToken, { user: { email: mockEmail } });

      sinon
        .stub(pool, "query")
        .onFirstCall()
        .resolves({ rows: [{ id: mockAccountId, owner: mockUserId }] })
        .onSecondCall()
        .resolves({ rows: [{ email: mockEmail }] })
        .onThirdCall()
        .resolves({ rows: [{ email: mockEmail }] })
        .onCall(3)
        .resolves() // BEGIN
        .onCall(4)
        .resolves() // Update accounts
        .onCall(5)
        .resolves(); // COMMIT

      const res = await chai
        .request(server)
        .post("/api/account/addUser")
        .set("Authorization", `Bearer ${mockToken}`)
        .send({ accountId: mockAccountId });

      expect(res).to.have.status(201);
      expect(res.body).to.have.property("message", "User Added successfully");
    });
    it("should return 401 if user cannot add others to account", async () => {
      const mockToken = generateMockToken();
      mockJwtVerify(mockToken, { user: { email: mockEmail } });

      sinon.stub(pool, "query").onFirstCall().resolves({ rows: [] });

      const res = await chai
        .request(server)
        .post("/api/account/addUser")
        .set("Authorization", `Bearer ${mockToken}`)
        .send({ accountId: mockAccountId });

      expect(res).to.have.status(401);
      expect(res.body).to.have.property(
        "message",
        "Unauthorized: Must be accounts owner to add users"
      );
    });
    it("should return 404 if the user does not exist", async () => {
      const mockToken = generateMockToken();
      mockJwtVerify(mockToken, { user: { email: mockEmail } });

      sinon
        .stub(pool, "query")
        .onFirstCall()
        .resolves({ rows: [{ id: mockAccountId, owner: mockUserId }] })
        .onSecondCall()
        .resolves({ rows: [] });

      const res = await chai
        .request(server)
        .post("/api/account/addUser")
        .set("Authorization", `Bearer ${mockToken}`)
        .send({ accountId: mockAccountId });

      expect(res).to.have.status(404);
      expect(res.body).to.have.property("message", "User Not found");
    });
    it("should return 403 if the user all ready has access", async () => {
      const mockToken = generateMockToken();
      mockJwtVerify(mockToken, { user: { email: mockEmail } });

      sinon
        .stub(pool, "query")
        .onFirstCall()
        .resolves({ rows: [{ id: mockAccountId, owner: mockUserId }] })
        .onSecondCall()
        .resolves({ rows: [{ email: mockEmail }] })
        .onThirdCall()
        .resolves({ rows: [] });

      const res = await chai
        .request(server)
        .post("/api/account/addUser")
        .set("Authorization", `Bearer ${mockToken}`)
        .send({ accountId: mockAccountId });

      expect(res).to.have.status(403);
      expect(res.body).to.have.property("message", "User has access all ready");
    });
    it("should return 500 if there is a DB error", async () => {
      const mockToken = generateMockToken();
      mockJwtVerify(mockToken, { user: { email: mockEmail } });

      sinon
        .stub(pool, "query")
        .onFirstCall()
        .resolves({ rows: [{ id: mockAccountId, owner: mockUserId }] })
        .onSecondCall()
        .resolves({ rows: [{ email: mockEmail }] })
        .onThirdCall()
        .resolves({ rows: [{ email: mockEmail }] })
        .onCall(3)
        .resolves() // BEGIN
        .onCall(4)
        .throws(new Error("Database Error"))
        .onCall(5)
        .resolves(); // ROLLBACK

      const res = await chai
        .request(server)
        .post("/api/account/addUser")
        .set("Authorization", `Bearer ${mockToken}`)
        .send({ accountId: mockAccountId });

      expect(res).to.have.status(500);
      expect(res.body).to.have.property("error", "Error adding user");
    });
  });

  describe("GET /api/account/transferOwnership", () => {
    it("should return change owner of an account", async () => {
      
      const mockToken = generateMockToken();
      mockJwtVerify(mockToken, { user: { email: mockEmail } });

      sinon
        .stub(pool, "query")
        .onFirstCall()
        .resolves({ rows: [{ id: mockAccountUsers }] })
        .onSecondCall()
        .resolves({ rows: [{ id: mockAccountId }] })
        .onThirdCall()
        .resolves() //BEGIN
        .onCall(3)
        .resolves() // Update accounts
        .onCall(4)
        .resolves(); //COMMIT

      const res = await chai
        .request(server)
        .post("/api/account/transferOwnership")
        .set("Authorization", `Bearer ${mockToken}`)
        .send({ mockAccountId, mockEmail });

      expect(res).to.have.status(201);
      expect(res.body).to.have.property(
        "message",
        "User owner changed successfully",
        mockAccountId
      );
    });
    it("should return 500 for a database error", async () => {
      const mockToken = generateMockToken();
      mockJwtVerify(mockToken, { user: { email: mockEmail } });

      sinon
      .stub(pool, "query")
      .onFirstCall()
      .resolves({ rows: [{ id: mockAccountUsers }] })
      .onSecondCall()
      .resolves({ rows: [{ id: mockAccountId }] })
      .onThirdCall()
      .resolves() //BEGIN
      .onCall(3)
      .throws(new Error("Database error"));

      const res = await chai
        .request(server)
        .post("/api/account/transferOwnership")
        .set("Authorization", `Bearer ${mockToken}`)
        .send({ mockAccountId, mockEmail });

      expect(res).to.have.status(500);
      expect(res.body).to.have.property("error", "Error changing owner" );
    });
    it("should return 401 for unauthorized", async () => {
      
      const mockToken = generateMockToken();
      mockJwtVerify(mockToken, { user: { email: mockEmail } });

      sinon
        .stub(pool, "query")
        .onFirstCall()
        .resolves({ rows: [] })
        .onSecondCall()
        .resolves({ rows: [{ id: mockAccountId }] })
        .onThirdCall()
        .resolves() //BEGIN
        .onCall(3)
        .resolves() // Update accounts
        .onCall(4)
        .resolves(); //COMMIT

      const res = await chai
        .request(server)
        .post("/api/account/transferOwnership")
        .set("Authorization", `Bearer ${mockToken}`)
        .send({ mockAccountId, mockEmail });

      expect(res).to.have.status(401);
      expect(res.body).to.have.property(
        "message",
        "Unauthorized: Must be accounts owner change ownership"
      );
    });
    it("should return 403 for forbidden access. Not account owner", async () => {
      
      const mockToken = generateMockToken();
      mockJwtVerify(mockToken, { user: { email: mockEmail } });

      sinon
        .stub(pool, "query")
        .onFirstCall()
        .resolves({ rows: [{ id: mockAccountUsers }] })
        .onSecondCall()
        .resolves({ rows: [] })
        .onThirdCall()
        .resolves() //BEGIN
        .onCall(3)
        .resolves() // Update accounts
        .onCall(4)
        .resolves(); //COMMIT

      const res = await chai
        .request(server)
        .post("/api/account/transferOwnership")
        .set("Authorization", `Bearer ${mockToken}`)
        .send({ mockAccountId, mockEmail });

      expect(res).to.have.status(403);
      expect(res.body).to.have.property(
        "message",
        "User to add must have access to this account to become its owner",
        mockAccountId
      );
    });
  });
});
