const chai = require("chai");
const chaiHttp = require("chai-http");
const server = require("../server");


chai.use(chaiHttp);


const { expect } = chai;
jest.mock("../routes/Dashboard", () => require("express").Router().get("/", (req, res) => res.status(200).send("Dashboard Route")));
jest.mock("../routes/Users", () => require("express").Router().get("/", (req, res) => res.status(200).send("Users Route")));
jest.mock("../routes/Auth", () => require("express").Router().get("/", (req, res) => res.status(200).send("Auth Route")));
jest.mock("../routes/Account", () => require("express").Router().get("/", (req, res) => res.status(200).send("Account Route")));
jest.mock("../routes/Transaction", () => require("express").Router().get("/", (req, res) => res.status(200).send("Transaction Route")));
jest.mock("../routes/Notification", () => require("express").Router().get("/", (req, res) => res.status(200).send("Notification Route")));


describe("Server API Routes", () => {
  it("should respond with 'API is running...' for the root route", (done) => {
    chai
      .request(server)
      .get("/")
      .end((err, res) => {
        expect(res).to.have.status(200);
        expect(res.text).to.equal("API is running...");
        done();
      });
  });
});

