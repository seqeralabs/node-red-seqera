/**
 * Tests for nodes/datalink-utils.js
 *
 * Tests the shared Data Link utility functions:
 * - evalProp: Property evaluation helper supporting JSONata
 * - resolveDataLink: Resolves Data Link by name
 * - listDataLink: Core file listing implementation
 */

const { expect } = require("chai");
const sinon = require("sinon");
const nock = require("nock");

// Note: We can't easily test evalProp and listDataLink without a full Node-RED
// environment, but we can test resolveDataLink which only needs node/apiCall

describe("datalink-utils.js", function () {
  const BASE_URL = "https://api.cloud.seqera.io";

  afterEach(function () {
    nock.cleanAll();
    sinon.restore();
  });

  describe("resolveDataLink()", function () {
    // Import the module
    const { resolveDataLink } = require("../nodes/datalink-utils");

    function createMockNode(token = "test-token") {
      return {
        seqeraConfig: {
          credentials: { token },
        },
        warn: sinon.stub(),
      };
    }

    function createMockRED() {
      return {
        util: {
          evaluateNodeProperty: sinon.stub(),
        },
      };
    }

    it("should resolve a data link by exact name", async function () {
      const mockNode = createMockNode();
      const mockRED = createMockRED();

      nock(BASE_URL)
        .get("/data-links/")
        .query(true)
        .reply(200, {
          dataLinks: [
            {
              id: "dl-123",
              name: "my-datalink",
              type: "S3",
              provider: "aws",
              resourceRef: "s3://bucket/path",
              credentials: [{ id: "cred-456" }],
            },
          ],
        });

      const result = await resolveDataLink(mockRED, mockNode, {}, "my-datalink", {
        baseUrl: BASE_URL,
        workspaceId: "ws-123",
      });

      expect(result.dataLinkId).to.equal("dl-123");
      expect(result.credentialsId).to.equal("cred-456");
      expect(result.resourceRef).to.equal("s3://bucket/path");
      expect(result.resourceType).to.equal("S3");
      expect(result.provider).to.equal("aws");
    });

    it("should throw error when dataLinkName is not provided", async function () {
      const mockNode = createMockNode();
      const mockRED = createMockRED();

      try {
        await resolveDataLink(mockRED, mockNode, {}, "", { baseUrl: BASE_URL });
        expect.fail("Should have thrown an error");
      } catch (err) {
        expect(err.message).to.include("dataLinkName not provided");
      }
    });

    it("should throw error when dataLinkName is null", async function () {
      const mockNode = createMockNode();
      const mockRED = createMockRED();

      try {
        await resolveDataLink(mockRED, mockNode, {}, null, { baseUrl: BASE_URL });
        expect.fail("Should have thrown an error");
      } catch (err) {
        expect(err.message).to.include("dataLinkName not provided");
      }
    });

    it("should throw error when data link not found", async function () {
      const mockNode = createMockNode();
      const mockRED = createMockRED();

      nock(BASE_URL).get("/data-links/").query(true).reply(200, { dataLinks: [] });

      try {
        await resolveDataLink(mockRED, mockNode, {}, "nonexistent", {
          baseUrl: BASE_URL,
          workspaceId: "ws-123",
        });
        expect.fail("Should have thrown an error");
      } catch (err) {
        expect(err.message).to.include("Could not find Data Link 'nonexistent'");
      }
    });

    it("should throw error when multiple data links match", async function () {
      const mockNode = createMockNode();
      const mockRED = createMockRED();

      nock(BASE_URL)
        .get("/data-links/")
        .query(true)
        .reply(200, {
          dataLinks: [
            { id: "dl-1", name: "ambiguous-1", resourceRef: "s3://a" },
            { id: "dl-2", name: "ambiguous-2", resourceRef: "s3://b" },
          ],
        });

      try {
        await resolveDataLink(mockRED, mockNode, {}, "ambiguous", {
          baseUrl: BASE_URL,
          workspaceId: "ws-123",
        });
        expect.fail("Should have thrown an error");
      } catch (err) {
        expect(err.message).to.include("more than one Data Link");
      }
    });

    it("should handle data link without credentials", async function () {
      const mockNode = createMockNode();
      const mockRED = createMockRED();

      nock(BASE_URL)
        .get("/data-links/")
        .query(true)
        .reply(200, {
          dataLinks: [
            {
              id: "dl-123",
              name: "public-datalink",
              type: "S3",
              provider: "aws",
              resourceRef: "s3://public-bucket",
              credentials: [],
            },
          ],
        });

      const result = await resolveDataLink(mockRED, mockNode, {}, "public-datalink", {
        baseUrl: BASE_URL,
        workspaceId: "ws-123",
      });

      expect(result.dataLinkId).to.equal("dl-123");
      expect(result.credentialsId).to.be.undefined;
    });

    it("should include workspaceId in search query", async function () {
      const mockNode = createMockNode();
      const mockRED = createMockRED();

      nock(BASE_URL)
        .get("/data-links/")
        .query((q) => q.workspaceId === "ws-specific")
        .reply(200, {
          dataLinks: [{ id: "dl-123", name: "test", resourceRef: "s3://bucket" }],
        });

      const result = await resolveDataLink(mockRED, mockNode, {}, "test", {
        baseUrl: BASE_URL,
        workspaceId: "ws-specific",
      });

      expect(result.dataLinkId).to.equal("dl-123");
    });

    it("should work without workspaceId", async function () {
      const mockNode = createMockNode();
      const mockRED = createMockRED();

      nock(BASE_URL)
        .get("/data-links/")
        .query((q) => !q.workspaceId)
        .reply(200, {
          dataLinks: [{ id: "dl-123", name: "test", resourceRef: "s3://bucket" }],
        });

      const result = await resolveDataLink(mockRED, mockNode, {}, "test", {
        baseUrl: BASE_URL,
      });

      expect(result.dataLinkId).to.equal("dl-123");
    });

    it("should handle API error", async function () {
      const mockNode = createMockNode();
      const mockRED = createMockRED();

      nock(BASE_URL).get("/data-links/").query(true).reply(500, { error: "Server error" });

      try {
        await resolveDataLink(mockRED, mockNode, {}, "test", {
          baseUrl: BASE_URL,
          workspaceId: "ws-123",
        });
        expect.fail("Should have thrown an error");
      } catch (err) {
        // Should propagate the API error
        expect(err.response.status).to.equal(500);
      }
    });

    it("should handle different provider types", async function () {
      const mockNode = createMockNode();
      const mockRED = createMockRED();

      nock(BASE_URL)
        .get("/data-links/")
        .query(true)
        .reply(200, {
          dataLinks: [
            {
              id: "dl-gcp",
              name: "gcp-datalink",
              type: "GS",
              provider: "google",
              resourceRef: "gs://bucket/path",
              credentials: [{ id: "cred-gcp" }],
            },
          ],
        });

      const result = await resolveDataLink(mockRED, mockNode, {}, "gcp-datalink", {
        baseUrl: BASE_URL,
        workspaceId: "ws-123",
      });

      expect(result.resourceType).to.equal("GS");
      expect(result.provider).to.equal("google");
      expect(result.resourceRef).to.equal("gs://bucket/path");
    });
  });

  // Note: evalProp requires full RED.util methods which are complex to mock
  // These are better tested through integration tests with the actual nodes

  // Note: listDataLink requires a fully configured node object with all
  // the property accessors (dataLinkNameProp, etc.) and is better tested
  // through the datalink-list node tests
});
