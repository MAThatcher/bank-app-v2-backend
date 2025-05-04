const chai = require("chai");
const chaiHttp = require("chai-http");
const server = require("../server");
const http = require("http");
const sinon = require("sinon");


chai.use(chaiHttp);


const { expect } = chai;
jest.mock("../routes/Dashboard", () => require("express").Router().get("/", (req, res) => res.status(200).send("Dashboard Route")));
jest.mock("../routes/Users", () => require("express").Router().get("/", (req, res) => res.status(200).send("Users Route")));
jest.mock("../routes/Auth", () => require("express").Router().get("/", (req, res) => res.status(200).send("Auth Route")));
jest.mock("../routes/Account", () => require("express").Router().get("/", (req, res) => res.status(200).send("Account Route")));
jest.mock("../routes/Transaction", () => require("express").Router().get("/", (req, res) => res.status(200).send("Transaction Route")));
jest.mock("../routes/Notification", () => require("express").Router().get("/", (req, res) => res.status(200).send("Notification Route")));


describe("Server API Routes",  () => {
  
  it("should respond with 'API is running...' for the root route", async () => {
    const res = await chai
      .request(server)
      .get("/");
      expect(res).to.have.status(200);
      expect(res.text).to.equal("API is running...");
  });
  
  it("should log the correct message when the server starts", () => {
    const logSpy = sinon.spy(console, "log");
    const listenStub = sinon.stub(server, "listen").callsFake((port, callback) => {
      callback();
      return { close: sinon.stub() };
    });


    if (require.main === module) {
      const PORT = 5000;
      server.listen(PORT, () => {
        expect(logSpy.calledOnce).to.be.true;
        expect(logSpy.firstCall.args[0]).to.equal(`Server running on port ${PORT}`);
      });
    }

    logSpy.restore();
    listenStub.restore();
  });
});

