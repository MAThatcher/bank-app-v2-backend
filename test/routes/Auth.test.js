const request = require("supertest");
const app = require("../../server");

request.use(chaiHttp);

describe("Auth Routes", () => {
  it("should return 404 for an invalid route", (done) => {
    request
      .request(app)
      .get("/api/auth/invalid")
      .end((err, res) => {
        expect(res).to.have.status(404);
        done();
      });
  });

  it("should authenticate a user", (done) => {
    request
      .request(app)
      .post("/api/auth/login")
      .send({ username: "testuser", password: "password123" })
      .end((err, res) => {
        expect(res).to.have.status(200);
        expect(res.body).to.have.property("token");
        done();
      });
  });
});
