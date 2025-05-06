const chai = require("chai");
const chaiHttp = require("chai-http");
const sinon = require("sinon");
const { expect } = chai;
const jwt = require("jsonwebtoken");
const server = require("../../server");
const pool = require("../../db");
const bcrypt = require("bcrypt");
const { sendVerificationEmail } = require("../../services/NodeMailer");

chai.use(chaiHttp);

// Helper functions
const mockEmail = "email@email.com";
const mockUserId = 1;
const mockAccountId = 1;

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

describe("Users Routes", () => {
  afterEach(() => {
    sinon.restore(); // Reset stubs and mocks after each test
  });

  describe("DELETE /api/users/:email", () => {
    it("should delete a user and return a success message", async () => {
      const mockToken = generateMockToken();
      mockJwtVerify(mockToken, { user: { email: mockEmail } });

      // Mock database queries
      sinon
        .stub(pool, "query")
        .onFirstCall()
        .resolves() // BEGIN
        .onSecondCall()
        .resolves() // UPDATE users
        .onThirdCall()
        .resolves(); // COMMIT

      const res = await chai
        .request(server)
        .delete(`/api/users/${mockEmail}`)
        .set("Authorization", `Bearer ${mockToken}`);

      expect(res).to.have.status(200);
      expect(res.body).to.have.property("message", "User Deleted Successfully");
    });

    it("should return 500 if there is a database error", async () => {
      const mockToken = generateMockToken();
      mockJwtVerify(mockToken, { user: { email: mockEmail } });

      // Mock database queries to throw an error
      sinon
        .stub(pool, "query")
        .onFirstCall()
        .resolves() // BEGIN
        .onSecondCall()
        .throws(new Error("Database error")) // Simulate error
        .onThirdCall()
        .resolves(); // ROLLBACK

      const res = await chai
        .request(server)
        .delete(`/api/users/${mockEmail}`)
        .set("Authorization", `Bearer ${mockToken}`);

      expect(res).to.have.status(500);
      expect(res.text).to.equal("Server Error");
    });
  });

  describe("GET /api/users", () => {
    it("should return user details", async () => {
      const mockToken = generateMockToken();
      const mockUserDetails = {
        id: 1,
        email: mockEmail,
        create_date: "2023-01-01",
        update_date: "2023-01-02",
        super_user: false,
      };

      // Mock jwt.verify
      mockJwtVerify(mockToken, { user: { email: mockEmail } });

      // Mock database query
      sinon.stub(pool, "query").resolves({ rows: [mockUserDetails] });

      const res = await chai
        .request(server)
        .get("/api/users")
        .set("Authorization", `Bearer ${mockToken}`);

      expect(res).to.have.status(200);
      expect(res.body).to.deep.equal(mockUserDetails);
    });

    it("should return 404 if the user is not found", async () => {
      const mockToken = generateMockToken();
      mockJwtVerify(mockToken, { user: { email: mockEmail } });

      // Mock database query to return no rows
      sinon.stub(pool, "query").resolves({ rows: [] });

      const res = await chai
        .request(server)
        .get("/api/users")
        .set("Authorization", `Bearer ${mockToken}`);

      expect(res).to.have.status(404);
      expect(res.body).to.have.property("error", "User not found");
    });

    it("should return 500 for a database error", async () => {
      const mockToken = generateMockToken();
      mockJwtVerify(mockToken, { user: { email: mockEmail } });

      sinon.stub(pool, "query").throws(new Error("Database error"));
      const res = await chai
        .request(server)
        .get("/api/users")
        .set("Authorization", `Bearer ${mockToken}`)
        .send({ mockAccountId });

      expect(res).to.have.status(500);
      expect(res.body).to.have.property("error", "Server Error");
    });
  });

  describe("POST /api/users/login", () => {
    it("should log in a user and return tokens", async () => {
      const mockPassword = "password123";
      const mockUser = {
        id: 1,
        email: mockEmail,
        password: await bcrypt.hash(mockPassword, 10),
        super_user: false,
      };

      // Mock database query
      sinon.stub(pool, "query").resolves({ rows: [mockUser] });

      // Mock bcrypt.compare
      sinon.stub(bcrypt, "compare").resolves(true);

      // Mock token generation
      sinon.stub(jwt, "sign").returns("mock-access-token");

      const res = await chai
        .request(server)
        .post("/api/users/login")
        .send({ email: mockEmail, password: mockPassword });

      expect(res).to.have.status(200);
      expect(res.body).to.have.property("accessToken", "mock-access-token");
      expect(res.body).to.have.property("refreshToken", "mock-access-token");
      expect(res.body).to.have.property("message", "Login Successful");
    });

    it("should return 401 if the email is not found", async () => {
      const mockEmail = "testuser@example.com";

      // Mock database query to return no rows
      sinon.stub(pool, "query").resolves({ rows: [] });

      const res = await chai
        .request(server)
        .post("/api/users/login")
        .send({ email: mockEmail, password: "password123" });

      expect(res).to.have.status(401);
      expect(res.body).to.have.property("error", "Email not found");
    });

    it("should return 401 if the password is incorrect", async () => {
      const mockPassword = "password123";
      const mockUser = {
        id: 1,
        email: mockEmail,
        password: await bcrypt.hash(mockPassword, 10),
        super_user: false,
      };

      // Mock database query
      sinon.stub(pool, "query").resolves({ rows: [mockUser] });

      // Mock bcrypt.compare
      sinon.stub(bcrypt, "compare").resolves(false);

      const res = await chai
        .request(server)
        .post("/api/users/login")
        .send({ email: mockEmail, password: mockPassword });

      expect(res).to.have.status(401);
      expect(res.body).to.have.property("error", "Invalid password");
    });

    it("should return 500 for a database error", async () => {
      sinon.stub(pool, "query").throws(new Error("Database error"));
      const res = await chai
        .request(server)
        .post("/api/users/login")
        .send({ email: mockEmail, password: "mockPassword" });

      expect(res).to.have.status(500);
      expect(res.text).to.equal("Server Error");
    });
  });

  describe("POST /api/users/register", () => {
    it("should register a new user and send a verification email", async () => {
      // Mock database query to insert a new user
      sinon
        .stub(pool, "query")
        .onFirstCall()
        .resolves() // Valid user check
        .onSecondCall()
        .resolves() // BEGIN
        .onThirdCall()
        .resolves({ rows: [{ id: mockUserId }] }) // Insert user
        .onCall(3)
        .resolves({ rows: [{ id: mockAccountId }] }) // Insert account user
        .onCall(4)
        .resolves(); // Commit

      // Mock bcrypt.hash
      sinon.stub(bcrypt, "hash").resolves("hashed-password");

      // Mock sendVerificationEmail
      // TODO: Figure out why this is not working
      sinon
        .stub(require("../../services/NodeMailer"), "sendResetEmail")
        .callsFake((token, email) => {
          return true; // Simulating successful email sending
        });

      const res = await chai
        .request(server)
        .post("/api/users/register")
        .send({ email: mockEmail, password: "password123" });

      expect(res).to.have.status(201);
      expect(res.body).to.have.property(
        "message",
        "User registered successfully"
      );
    });

    it("should return 400 if the email is already registered", async () => {
      // Mock database query to simulate email already exists
      sinon
        .stub(pool, "query")
        .onFirstCall()
        .resolves({ rows: [{ id: mockUserId }] }) // Insert user
        .onSecondCall()
        .resolves() // BEGIN
        .onThirdCall()
        .resolves({ rows: [{ id: mockUserId }] }) // Insert user
        .onCall(3)
        .resolves({ rows: [{ id: mockAccountId }] }) // Insert account user
        .onCall(4)
        .resolves(); // Commit
      const res = await chai
        .request(server)
        .post("/api/users/register")
        .send({ email: mockEmail, password: "password123" });

      expect(res).to.have.status(400);
      expect(res.body).to.have.property("error", "Email is already registered");
    });

    it("should return 500 for a database error", async () => {
      sinon
        .stub(pool, "query")
        .onFirstCall()
        .resolves() // Insert user
        .onSecondCall()
        .resolves() // BEGIN
        .onThirdCall()
        .throws(new Error("Database error"));

      const res = await chai
        .request(server)
        .post("/api/users/register")
        .send({ email: "newuser@example.com", password: "password123" });

      expect(res).to.have.status(500);
    });
  });

  describe("POST /api/users/verify-email", () => {
    it("should verify the user's email and activate the account", async () => {
      const mockToken = generateMockToken();
      mockJwtVerify(mockToken, { user: { email: mockEmail } });
      sinon
        .stub(pool, "query")
        .onFirstCall()
        .resolves() // BEGIN
        .onSecondCall()
        .resolves() // Update user verification status
        .onThirdCall()
        .resolves(); // COMMIT

      const res = await chai
        .request(server)
        .get(`/api/users/verify-email/${mockToken}`)
        .send({ token: mockToken });
      //TODO: Why is this not working?
      expect(res).to.have.status(200);
      expect(res.body).to.have.property(
        "message",
        "Email verified successfully"
      );
    });

    it("should return 500 for a database error", async () => {
      const mockToken = generateMockToken();
      mockJwtVerify(mockToken, { user: { email: mockEmail } });
      sinon
        .stub(pool, "query")
        .onFirstCall()
        .resolves() // BEGIN
        .onSecondCall()
        .resolves() // Update user verification status
        .onThirdCall()
        .throws(new Error("Database error"));

      const res = await chai
        .request(server)
        .get(`/api/users/verify-email/${mockToken}`)
        .send({ token: "mock-verification-token" });

      expect(res).to.have.status(500);
      expect(res.body).to.have.property("error", "Server Error");
    });
  });
});
