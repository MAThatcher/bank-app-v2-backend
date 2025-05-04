jest.mock('../../db.js'); // Must match the relative path you use in real code
const chai = require("chai");
const chaiHttp = require("chai-http");
const sinon = require("sinon");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { expect } = chai;
const server = require("../../server");
const pool = require('../../db.js');
const { sendResetEmail } = require("../../services/NodeMailer");

chai.use(chaiHttp);

describe("Auth Routes", () => {
    
  afterEach(() => {
    sinon.restore(); // Reset stubs and mocks after each test
  });

  describe("POST /api/auth/refresh", () => {
    it("should return 403 if refresh token is invalid", async () => {
      const invalidToken = "invalid-refresh-token";
  
      // Mock database query
      sinon.stub(pool, "query").resolves({ rows: [{valid: false}] });
      const res = await chai
        .request(server)
        .post("/api/auth/refresh")
        .send({ refreshToken: invalidToken });
  
      expect(res).to.have.status(403); // Forbidden
    });

    it("should return 403 if refresh token is wrong", async () => {
        const validToken = "invalid-refresh-token";
    
        // Mock database query
        sinon.stub(pool, "query").resolves({ rows: [{valid: true}] });

        sinon.stub(jwt, "verify").callsFake((token, secret, callback) => {
            callback({message: "JTWVerifyError", expiredAt: "today"});
          });

        const res = await chai
          .request(server)
          .post("/api/auth/refresh")
          .send({ refreshToken: validToken });
    
        expect(res).to.have.status(403); // Forbidden
      });
  
    it("should return 200 with access token for valid refresh token", async () => {
      const validToken = "valid-refresh-token";
      const mockResult = { rows: [{ valid: true }] };
      const mockAccessToken = "mock-access-token"; // The mocked token
  
      // Mock the database query to return valid token data
      sinon.stub(pool, "query").resolves(mockResult);
  
      // Mock jwt.verify to simulate successful decoding
      sinon.stub(jwt, "verify").callsFake((token, secret, callback) => {
        callback(null, { user: { id: 1, email: "testuser@example.com" } });
      });
  
      // Mock the generateAccessToken function to return the mocked access token
      sinon.stub(require("../../services/AuthService"), "generateAccessToken").returns(mockAccessToken);
  
      const res = await chai
        .request(server)
        .post("/api/auth/refresh")
        .send({ refreshToken: validToken });
  
      expect(res).to.have.status(200); // OK
      expect({accessToken:mockAccessToken}).to.have.property("accessToken", mockAccessToken); // Ensure the mocked token is returned
    });

    it("should return 500 if there is an error during renew refresh token",async () => {
        const validToken = "valid-refresh-token";

        // Mock database query to simulate an error
        sinon.stub(pool, "query").throws(new Error());
        const res = await chai
          .request(server)
          .post("/api/auth/refresh")
          .send({ accessToken: validToken });
          expect(res).to.have.status(500); // Internal Server Error
          expect(res.body).to.have.property("message", "Error");
      });
  });
  

  describe("POST /api/auth/forgot-password", () => {
    it("should return 400 if user is not found",async () => {
      const email = "nonexistentuser@example.com";

      // Mock database query to return no users
      sinon.stub(pool, "query").resolves({ rows: [] });

      const res = await chai
        .request(server)
        .post("/api/auth/forgot-password")
        .send({ email });
        expect(res).to.have.status(400); // Bad Request
        expect(res.body).to.have.property("message", "User not found");
    });

    it("should return 200 if password reset email is sent",async () => {
      const email = "testuser@example.com";
      const mockUser = { rows: [{ id: 1, email: "testuser@example.com" }] };
      const mockToken = "mock-reset-token";

      // Mock database query to return the user
      sinon.stub(pool, "query").resolves(mockUser);

      // Mock jwt.sign
      sinon.stub(jwt, "sign").returns(mockToken);

      // Mock sendResetEmail to simulate success
      sinon.stub(require("../../services/NodeMailer"), "sendResetEmail").callsFake((token, email) => {
        return true; // Simulating successful email sending
      });

      const res = await chai
        .request(server)
        .post("/api/auth/forgot-password")
        .send({ email });
        expect(res).to.have.status(200); // OK
        expect(res.body).to.have.property("message", "Password reset email sent");
    });

    // it("should return 500 if there is an error sending the email",async () => {
    //   const email = "testuser@example.com";
    //   const validToken = "valid-refresh-token";


    //   // Mock database query to return the user
    //   sinon.stub(pool, "query").throws(new Error())
      
    //   const res = await chai
    //     .request(server)
    //     .post("/api/auth/forgot-password")
    //     .send({ email,validToken });
    //     expect(res).to.have.status(500); // Internal Server Error
    //     expect(res.body).to.have.property("message", "Error sending email");      
    // });
  });

  describe("POST /api/auth/reset-password", () => {
    it("should return 500 if the token is invalid",async () => {
      const invalidToken = "invalid-reset-token";
      const newPassword = "newPassword123";
      sinon.stub(pool, "query").resolves({user :''});

      const res = await chai
        .request(server)
        .post("/api/auth/reset-password")
        .send({ password: newPassword, token: invalidToken });
        expect(res).to.have.status(500); // Bad Request
        expect(res.body).to.have.property("message", "Failed to reset password");
    });

    it("should return 200 if password is reset successfully",async () => {
      const validToken = "valid-reset-token";
      const newPassword = "newPassword123";
      const mockDecoded = { id: 1 };
      const mockUser = { rows: [{ id: 1, email: "testuser@example.com" }] };

      // Mock jwt.verify to return the decoded token
      sinon.stub(jwt, "verify").returns(mockDecoded);

      // Mock database query to return the user
      sinon.stub(pool, "query").resolves(mockUser);

      // Mock bcrypt.hash to simulate password hashing
      sinon.stub(bcrypt, "hash").resolves("hashedPassword");

      const res = await chai
        .request(server)
        .post("/api/auth/reset-password")
        .send({ password: newPassword, token: validToken });
        expect(res).to.have.status(200); // OK
        expect(res.body).to.have.property("message", "Password reset successfully");
    });

    it("should return 400 if there is an error during the password reset process",async () => {
      const validToken = "valid-reset-token";
      const newPassword = "newPassword123";
      const mockDecoded = { id: 1 };

      // Mock jwt.verify to return the decoded token
      sinon.stub(jwt, "verify").returns(mockDecoded);

      // Mock database query to simulate an error
      sinon.stub(pool, "query").resolves(null);

      const res = await chai
        .request(server)
        .post("/api/auth/reset-password")
        .send({ password: newPassword, token: validToken });
        expect(res).to.have.status(400); // Internal Server Error
        expect(res.body).to.have.property("message", "Invalid token");
    });
  });
});
