/**
 * Tests for nodes/config.js (seqera-config node)
 *
 * Tests the configuration node that stores:
 * - Base URL for Seqera Platform API
 * - API token (credentials)
 * - Workspace ID
 *
 * Also tests the HTTP admin endpoints:
 * - /seqera-config/connectivity-check
 * - /seqera-config/workspaces
 */

const {
  helper,
  nock,
  DEFAULT_BASE_URL,
  createUserInfoResponse,
  createOrganizationsResponse,
  createWorkspacesResponse,
} = require("./helper");
const { expect } = require("chai");

const configNode = require("../nodes/config");

describe("seqera-config Node", function () {
  beforeEach(function (done) {
    helper.startServer(done);
  });

  afterEach(function (done) {
    helper.unload();
    helper.stopServer(done);
    nock.cleanAll();
  });

  describe("node loading", function () {
    it("should be loaded with correct type", function (done) {
      const flow = [
        {
          id: "config1",
          type: "seqera-config",
          name: "Test Config",
          baseUrl: DEFAULT_BASE_URL,
          workspaceId: "12345",
        },
      ];

      helper.load(configNode, flow, function () {
        const n1 = helper.getNode("config1");
        try {
          expect(n1).to.exist;
          expect(n1.type).to.equal("seqera-config");
          expect(n1.name).to.equal("Test Config");
          done();
        } catch (err) {
          done(err);
        }
      });
    });

    it("should store baseUrl from config", function (done) {
      const flow = [
        {
          id: "config1",
          type: "seqera-config",
          name: "Test Config",
          baseUrl: "https://custom.seqera.io",
          workspaceId: "12345",
        },
      ];

      helper.load(configNode, flow, function () {
        const n1 = helper.getNode("config1");
        try {
          expect(n1.baseUrl).to.equal("https://custom.seqera.io");
          done();
        } catch (err) {
          done(err);
        }
      });
    });

    it("should use default baseUrl when not provided", function (done) {
      const flow = [
        {
          id: "config1",
          type: "seqera-config",
          name: "Test Config",
          workspaceId: "12345",
        },
      ];

      helper.load(configNode, flow, function () {
        const n1 = helper.getNode("config1");
        try {
          expect(n1.baseUrl).to.equal(DEFAULT_BASE_URL);
          done();
        } catch (err) {
          done(err);
        }
      });
    });

    it("should store workspaceId from config", function (done) {
      const flow = [
        {
          id: "config1",
          type: "seqera-config",
          name: "Test Config",
          baseUrl: DEFAULT_BASE_URL,
          workspaceId: "workspace-123",
        },
      ];

      helper.load(configNode, flow, function () {
        const n1 = helper.getNode("config1");
        try {
          expect(n1.workspaceId).to.equal("workspace-123");
          done();
        } catch (err) {
          done(err);
        }
      });
    });

    it("should handle null workspaceId", function (done) {
      const flow = [
        {
          id: "config1",
          type: "seqera-config",
          name: "Test Config",
          baseUrl: DEFAULT_BASE_URL,
        },
      ];

      helper.load(configNode, flow, function () {
        const n1 = helper.getNode("config1");
        try {
          expect(n1.workspaceId).to.be.null;
          done();
        } catch (err) {
          done(err);
        }
      });
    });

    it("should store credentials", function (done) {
      const flow = [
        {
          id: "config1",
          type: "seqera-config",
          name: "Test Config",
          baseUrl: DEFAULT_BASE_URL,
          workspaceId: "12345",
        },
      ];

      const credentials = {
        config1: { token: "secret-token-123" },
      };

      helper.load(configNode, flow, credentials, function () {
        const n1 = helper.getNode("config1");
        try {
          expect(n1.credentials).to.exist;
          expect(n1.credentials.token).to.equal("secret-token-123");
          done();
        } catch (err) {
          done(err);
        }
      });
    });
  });

  describe("connectivity-check endpoint", function () {
    it("should return success with user info on valid token", function (done) {
      const flow = [
        {
          id: "config1",
          type: "seqera-config",
          name: "Test Config",
          baseUrl: DEFAULT_BASE_URL,
          workspaceId: "12345",
        },
      ];

      nock(DEFAULT_BASE_URL)
        .get("/user-info")
        .matchHeader("Authorization", "Bearer test-token")
        .reply(200, createUserInfoResponse());

      helper.load(configNode, flow, function () {
        helper
          .request()
          .get("/seqera-config/connectivity-check")
          .query({ baseUrl: DEFAULT_BASE_URL, token: "test-token" })
          .expect(200)
          .end(function (err, res) {
            if (err) return done(err);
            try {
              expect(res.body.success).to.be.true;
              expect(res.body.user).to.exist;
              expect(res.body.user.userName).to.equal("testuser");
              expect(res.body.user.email).to.equal("test@example.com");
              done();
            } catch (e) {
              done(e);
            }
          });
      });
    });

    it("should return error when token is missing", function (done) {
      const flow = [
        {
          id: "config1",
          type: "seqera-config",
          name: "Test Config",
          baseUrl: DEFAULT_BASE_URL,
        },
      ];

      helper.load(configNode, flow, function () {
        helper
          .request()
          .get("/seqera-config/connectivity-check")
          .query({ baseUrl: DEFAULT_BASE_URL })
          .expect(200)
          .end(function (err, res) {
            if (err) return done(err);
            try {
              expect(res.body.success).to.be.false;
              expect(res.body.message).to.equal("No API token provided");
              expect(res.body.isEmptyToken).to.be.true;
              done();
            } catch (e) {
              done(e);
            }
          });
      });
    });

    it("should return error when baseUrl is missing", function (done) {
      const flow = [
        {
          id: "config1",
          type: "seqera-config",
          name: "Test Config",
        },
      ];

      helper.load(configNode, flow, function () {
        helper
          .request()
          .get("/seqera-config/connectivity-check")
          .query({ token: "test-token" })
          .expect(200)
          .end(function (err, res) {
            if (err) return done(err);
            try {
              expect(res.body.success).to.be.false;
              expect(res.body.message).to.equal("No base URL provided");
              done();
            } catch (e) {
              done(e);
            }
          });
      });
    });

    it("should return error on invalid token (401)", function (done) {
      const flow = [
        {
          id: "config1",
          type: "seqera-config",
          name: "Test Config",
          baseUrl: DEFAULT_BASE_URL,
        },
      ];

      nock(DEFAULT_BASE_URL).get("/user-info").reply(401, { message: "Unauthorized" });

      helper.load(configNode, flow, function () {
        helper
          .request()
          .get("/seqera-config/connectivity-check")
          .query({ baseUrl: DEFAULT_BASE_URL, token: "invalid-token" })
          .expect(200)
          .end(function (err, res) {
            if (err) return done(err);
            try {
              expect(res.body.success).to.be.false;
              expect(res.body.message).to.equal("Invalid API token");
              done();
            } catch (e) {
              done(e);
            }
          });
      });
    });

    it("should return error on forbidden (403)", function (done) {
      const flow = [
        {
          id: "config1",
          type: "seqera-config",
          name: "Test Config",
          baseUrl: DEFAULT_BASE_URL,
        },
      ];

      nock(DEFAULT_BASE_URL).get("/user-info").reply(403, { message: "Forbidden" });

      helper.load(configNode, flow, function () {
        helper
          .request()
          .get("/seqera-config/connectivity-check")
          .query({ baseUrl: DEFAULT_BASE_URL, token: "forbidden-token" })
          .expect(200)
          .end(function (err, res) {
            if (err) return done(err);
            try {
              expect(res.body.success).to.be.false;
              expect(res.body.message).to.equal("Invalid API token");
              done();
            } catch (e) {
              done(e);
            }
          });
      });
    });

    it("should use stored token when nodeId is provided", function (done) {
      const flow = [
        {
          id: "config1",
          type: "seqera-config",
          name: "Test Config",
          baseUrl: DEFAULT_BASE_URL,
          workspaceId: "12345",
        },
      ];

      const credentials = {
        config1: { token: "stored-token-123" },
      };

      nock(DEFAULT_BASE_URL)
        .get("/user-info")
        .matchHeader("Authorization", "Bearer stored-token-123")
        .reply(200, createUserInfoResponse());

      helper.load(configNode, flow, credentials, function () {
        helper
          .request()
          .get("/seqera-config/connectivity-check")
          .query({ baseUrl: DEFAULT_BASE_URL, nodeId: "config1" })
          .expect(200)
          .end(function (err, res) {
            if (err) return done(err);
            try {
              expect(res.body.success).to.be.true;
              done();
            } catch (e) {
              done(e);
            }
          });
      });
    });

    it("should return error when nodeId has no stored token", function (done) {
      const flow = [
        {
          id: "config1",
          type: "seqera-config",
          name: "Test Config",
          baseUrl: DEFAULT_BASE_URL,
        },
      ];

      helper.load(configNode, flow, function () {
        helper
          .request()
          .get("/seqera-config/connectivity-check")
          .query({ baseUrl: DEFAULT_BASE_URL, nodeId: "config1" })
          .expect(200)
          .end(function (err, res) {
            if (err) return done(err);
            try {
              expect(res.body.success).to.be.false;
              expect(res.body.message).to.equal("No stored token found");
              expect(res.body.isEmptyToken).to.be.true;
              done();
            } catch (e) {
              done(e);
            }
          });
      });
    });
  });

  describe("workspaces endpoint", function () {
    it("should return organizations with workspaces", function (done) {
      const flow = [
        {
          id: "config1",
          type: "seqera-config",
          name: "Test Config",
          baseUrl: DEFAULT_BASE_URL,
        },
      ];

      nock(DEFAULT_BASE_URL)
        .get("/orgs")
        .reply(200, createOrganizationsResponse([{ orgId: 1, name: "org1", fullName: "Organization 1" }]));

      nock(DEFAULT_BASE_URL).get("/orgs/1/workspaces").reply(200, createWorkspacesResponse());

      helper.load(configNode, flow, function () {
        helper
          .request()
          .get("/seqera-config/workspaces")
          .query({ baseUrl: DEFAULT_BASE_URL, token: "test-token" })
          .expect(200)
          .end(function (err, res) {
            if (err) return done(err);
            try {
              expect(res.body.success).to.be.true;
              expect(res.body.organizations).to.be.an("array");
              expect(res.body.organizations).to.have.length(1);
              expect(res.body.organizations[0].orgName).to.equal("org1");
              expect(res.body.organizations[0].workspaces).to.be.an("array");
              done();
            } catch (e) {
              done(e);
            }
          });
      });
    });

    it("should filter out community organization", function (done) {
      const flow = [
        {
          id: "config1",
          type: "seqera-config",
          name: "Test Config",
          baseUrl: DEFAULT_BASE_URL,
        },
      ];

      nock(DEFAULT_BASE_URL)
        .get("/orgs")
        .reply(
          200,
          createOrganizationsResponse([
            { orgId: 1, name: "community", fullName: "Community" },
            { orgId: 2, name: "my-org", fullName: "My Organization" },
          ]),
        );

      nock(DEFAULT_BASE_URL).get("/orgs/2/workspaces").reply(200, createWorkspacesResponse());

      helper.load(configNode, flow, function () {
        helper
          .request()
          .get("/seqera-config/workspaces")
          .query({ baseUrl: DEFAULT_BASE_URL, token: "test-token" })
          .expect(200)
          .end(function (err, res) {
            if (err) return done(err);
            try {
              expect(res.body.success).to.be.true;
              // Should only have my-org, community should be filtered
              expect(res.body.organizations).to.have.length(1);
              expect(res.body.organizations[0].orgName).to.equal("my-org");
              done();
            } catch (e) {
              done(e);
            }
          });
      });
    });

    it("should filter out organizations with no workspaces", function (done) {
      const flow = [
        {
          id: "config1",
          type: "seqera-config",
          name: "Test Config",
          baseUrl: DEFAULT_BASE_URL,
        },
      ];

      nock(DEFAULT_BASE_URL)
        .get("/orgs")
        .reply(
          200,
          createOrganizationsResponse([
            { orgId: 1, name: "empty-org", fullName: "Empty Organization" },
            { orgId: 2, name: "has-workspaces", fullName: "Has Workspaces" },
          ]),
        );

      nock(DEFAULT_BASE_URL).get("/orgs/1/workspaces").reply(200, { workspaces: [] });

      nock(DEFAULT_BASE_URL).get("/orgs/2/workspaces").reply(200, createWorkspacesResponse());

      helper.load(configNode, flow, function () {
        helper
          .request()
          .get("/seqera-config/workspaces")
          .query({ baseUrl: DEFAULT_BASE_URL, token: "test-token" })
          .expect(200)
          .end(function (err, res) {
            if (err) return done(err);
            try {
              expect(res.body.success).to.be.true;
              expect(res.body.organizations).to.have.length(1);
              expect(res.body.organizations[0].orgName).to.equal("has-workspaces");
              done();
            } catch (e) {
              done(e);
            }
          });
      });
    });

    it("should return error when token is missing", function (done) {
      const flow = [
        {
          id: "config1",
          type: "seqera-config",
          name: "Test Config",
          baseUrl: DEFAULT_BASE_URL,
        },
      ];

      helper.load(configNode, flow, function () {
        helper
          .request()
          .get("/seqera-config/workspaces")
          .query({ baseUrl: DEFAULT_BASE_URL })
          .expect(200)
          .end(function (err, res) {
            if (err) return done(err);
            try {
              expect(res.body.success).to.be.false;
              expect(res.body.message).to.equal("No API token provided");
              done();
            } catch (e) {
              done(e);
            }
          });
      });
    });

    it("should return error on invalid token", function (done) {
      const flow = [
        {
          id: "config1",
          type: "seqera-config",
          name: "Test Config",
          baseUrl: DEFAULT_BASE_URL,
        },
      ];

      nock(DEFAULT_BASE_URL).get("/orgs").reply(401, { message: "Unauthorized" });

      helper.load(configNode, flow, function () {
        helper
          .request()
          .get("/seqera-config/workspaces")
          .query({ baseUrl: DEFAULT_BASE_URL, token: "invalid-token" })
          .expect(200)
          .end(function (err, res) {
            if (err) return done(err);
            try {
              expect(res.body.success).to.be.false;
              expect(res.body.message).to.equal("Invalid API token");
              done();
            } catch (e) {
              done(e);
            }
          });
      });
    });
  });
});
