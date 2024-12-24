const chai = require("chai");
const chaiHttp = require("chai-http");
const { expect } = chai;
const app = require("../server"); // Import the app

chai.use(chaiHttp);

describe("Server Tests", () => {
  // Test the root endpoint
  it("should return API status message on /", (done) => {
    chai
      .request(app)
      .get("/")
      .end((err, res) => {
        expect(res).to.have.status(200);
        expect(res.text).to.equal("API is running...");
        done();
      });
  });

  // Test a non-existent route
  it("should return 404 for a non-existent route", (done) => {
    chai
      .request(app)
      .get("/non-existent-route")
      .end((err, res) => {
        expect(res).to.have.status(404);
        done();
      });
  });
});
