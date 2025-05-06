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
const mockNotificationId = 1;

function generateMockToken() {
  return jwt.sign({ user: { email: mockEmail, id: mockUserId } }, "mock-secret", {
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

describe("Notification Routes", () => {
  afterEach(() => {
    sinon.restore(); // Reset stubs and mocks after each test
  });

  describe("GET /api/notification", () => {
    it("should return 404 if no notifications are found", async () => {
      const mockToken = generateMockToken();
      mockJwtVerify(mockToken, { user: { email: mockEmail, id: mockUserId } });

      sinon.stub(pool, "query").resolves({ rows: [] });

      const res = await chai
        .request(server)
        .get("/api/notification")
        .set("Authorization", `Bearer ${mockToken}`);

      expect(res).to.have.status(404);
      expect(res.body).to.have.property("error", "No notifications found");
    });

    it("should return 500 for a database error", async () => {
      const mockToken = generateMockToken();
      mockJwtVerify(mockToken, { user: { email: mockEmail, id: mockUserId } });

      sinon.stub(pool, "query").throws(new Error("Database error"));

      const res = await chai
        .request(server)
        .get("/api/notification")
        .set("Authorization", `Bearer ${mockToken}`);

      expect(res).to.have.status(500);
      expect(res.body).to.deep.equal({});
    });
  });

  describe("GET /api/notification/:notificationId", () => {
    it("should return a single notification if it exists", async () => {
      const mockNotification = { id: mockNotificationId, message: "Notification 1", dismissed: false };
      const mockToken = generateMockToken();
      mockJwtVerify(mockToken, { user: { email: mockEmail, id: mockUserId } });

      sinon.stub(pool, "query").resolves({ rows: [mockNotification] });

      const res = await chai
        .request(server)
        .get(`/api/notification/${mockNotificationId}`)
        .set("Authorization", `Bearer ${mockToken}`);

      expect(res).to.have.status(200);
      expect(res.body).to.deep.equal([mockNotification]);
    });

    it("should return 404 if the notification does not exist", async () => {
      const mockToken = generateMockToken();
      mockJwtVerify(mockToken, { user: { email: mockEmail, id: mockUserId } });

      sinon.stub(pool, "query").resolves({ rows: [] });

      const res = await chai
        .request(server)
        .get(`/api/notification/${mockNotificationId}`)
        .set("Authorization", `Bearer ${mockToken}`);

      expect(res).to.have.status(404);
      expect(res.body).to.have.property("error", "No notification found");
    });

    it("should return 500 for a database error", async () => {
      const mockToken = generateMockToken();
      mockJwtVerify(mockToken, { user: { email: mockEmail, id: mockUserId } });

      sinon.stub(pool, "query").throws(new Error("Database error"));

      const res = await chai
        .request(server)
        .get(`/api/notification/${mockNotificationId}`)
        .set("Authorization", `Bearer ${mockToken}`);

      expect(res).to.have.status(500);
      expect(res.body).to.deep.equal({});
    });
  });

  describe("PATCH /api/notification/:notificationId", () => {
    it("should mark a notification as read", async () => {
      const mockToken = generateMockToken();
      mockJwtVerify(mockToken, { user: { email: mockEmail, id: mockUserId } });

      sinon.stub(pool, "query").resolves({ rows: [{ id: mockNotificationId }] });

      const res = await chai
        .request(server)
        .patch(`/api/notification/${mockNotificationId}`)
        .set("Authorization", `Bearer ${mockToken}`);

      expect(res).to.have.status(200);
      expect(res.body).to.deep.equal([{ id: mockNotificationId }]);
    });

    it("should return 404 if the notification does not exist", async () => {
      const mockToken = generateMockToken();
      mockJwtVerify(mockToken, { user: { email: mockEmail, id: mockUserId } });

      sinon.stub(pool, "query").resolves({ rows: [] });

      const res = await chai
        .request(server)
        .patch(`/api/notification/${mockNotificationId}`)
        .set("Authorization", `Bearer ${mockToken}`);

      expect(res).to.have.status(404);
      expect(res.body).to.have.property("error", "No notification found");
    });

    it("should return 500 for a database error", async () => {
      const mockToken = generateMockToken();
      mockJwtVerify(mockToken, { user: { email: mockEmail, id: mockUserId } });

      sinon.stub(pool, "query").throws(new Error("Database error"));

      const res = await chai
        .request(server)
        .patch(`/api/notification/${mockNotificationId}`)
        .set("Authorization", `Bearer ${mockToken}`);

      expect(res).to.have.status(500);
      expect(res.body).to.deep.equal({});
    });
  });

  describe("POST /api/notification", () => {
    it("should create a notification", async () => {
      const mockMessage = "New notification";
      const mockToken = generateMockToken();
      mockJwtVerify(mockToken, { user: { email: mockEmail, id: mockUserId } });

      sinon.stub(pool, "query").resolves({ rows: [{ id: mockNotificationId }] });

      const res = await chai
        .request(server)
        .post("/api/notification")
        .set("Authorization", `Bearer ${mockToken}`)
        .send({ message: mockMessage });

      expect(res).to.have.status(200);
      expect(res.body).to.deep.equal([{ id: mockNotificationId }]);
    });

    it("should return 500 for a database error", async () => {
      const mockMessage = "New notification";
      const mockToken = generateMockToken();
      mockJwtVerify(mockToken, { user: { email: mockEmail, id: mockUserId } });

      sinon.stub(pool, "query").throws(new Error("Database error"));

      const res = await chai
        .request(server)
        .post("/api/notification")
        .set("Authorization", `Bearer ${mockToken}`)
        .send({ message: mockMessage });

      expect(res).to.have.status(500);
      expect(res.body).to.deep.equal({});
    });
  });
});