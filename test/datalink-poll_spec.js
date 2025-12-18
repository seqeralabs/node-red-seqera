/**
 * Tests for nodes/datalink-poll.js (seqera-datalink-poll node)
 *
 * Tests the Data Link polling functionality including:
 * - Automatic polling at configurable intervals
 * - Configurable output modes: 2 outputs (New, Deleted) or 3 outputs (All, New, Deleted)
 * - New file detection since last poll
 * - Deleted file detection since last poll
 * - Filtering by prefix and pattern
 * - Poll frequency unit conversion (seconds, minutes, hours, days)
 */

const {
  helper,
  nock,
  DEFAULT_BASE_URL,
  DEFAULT_WORKSPACE_ID,
  createConfigNode,
  createCredentials,
  createDataLinksResponse,
  createDataBrowserResponse,
} = require("./helper");
const { expect } = require("chai");

const datalinkPollNode = require("../nodes/datalink-poll");
const configNode = require("../nodes/config");

describe("seqera-datalink-poll Node", function () {
  beforeEach(function (done) {
    helper.startServer(done);
  });

  afterEach(function (done) {
    nock.cleanAll();
    helper.unload();
    helper.stopServer(done);
  });

  // Helper to set up standard datalink API mocks
  function setupDatalinkMocks(files = null) {
    const defaultFiles = [
      { name: "file1.txt", type: "FILE", size: 1024 },
      { name: "file2.csv", type: "FILE", size: 2048 },
    ];

    nock(DEFAULT_BASE_URL)
      .get("/data-links/")
      .query(true)
      .reply(
        200,
        createDataLinksResponse([
          {
            id: "dl-123",
            name: "my-datalink",
            type: "S3",
            provider: "aws",
            resourceRef: "s3://bucket/data",
            credentials: [{ id: "cred-1" }],
          },
        ]),
      )
      .persist();

    nock(DEFAULT_BASE_URL)
      .get(/\/data-links\/dl-123\/browse/)
      .query(true)
      .reply(200, createDataBrowserResponse(files || defaultFiles))
      .persist();
  }

  describe("node loading", function () {
    it("should be loaded with correct type", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "poll1",
          type: "seqera-datalink-poll",
          name: "Test Datalink Poll",
          seqera: "config-node-1",
          dataLinkName: "my-datalink",
          dataLinkNameType: "str",
          pollFrequency: "15",
          pollUnits: "minutes",
          wires: [[], []],
        },
      ];

      setupDatalinkMocks();

      helper.load([configNode, datalinkPollNode], flow, createCredentials(), function () {
        const n1 = helper.getNode("poll1");
        try {
          expect(n1).to.exist;
          expect(n1.type).to.equal("seqera-datalink-poll");
          expect(n1.name).to.equal("Test Datalink Poll");
          n1.close();
          done();
        } catch (err) {
          n1.close();
          done(err);
        }
      });
    });

    it("should store poll frequency configuration", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "poll1",
          type: "seqera-datalink-poll",
          name: "Test Datalink Poll",
          seqera: "config-node-1",
          dataLinkName: "my-datalink",
          dataLinkNameType: "str",
          pollFrequency: "30",
          pollUnits: "seconds",
          wires: [[], []],
        },
      ];

      setupDatalinkMocks();

      helper.load([configNode, datalinkPollNode], flow, createCredentials(), function () {
        const n1 = helper.getNode("poll1");
        try {
          expect(n1.pollFrequencySec).to.equal(30);
          n1.close();
          done();
        } catch (err) {
          n1.close();
          done(err);
        }
      });
    });

    it("should calculate poll frequency correctly for minutes", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "poll1",
          type: "seqera-datalink-poll",
          name: "Test Datalink Poll",
          seqera: "config-node-1",
          dataLinkName: "my-datalink",
          dataLinkNameType: "str",
          pollFrequency: "5",
          pollUnits: "minutes",
          wires: [[], []],
        },
      ];

      setupDatalinkMocks();

      helper.load([configNode, datalinkPollNode], flow, createCredentials(), function () {
        const n1 = helper.getNode("poll1");
        try {
          expect(n1.pollFrequencySec).to.equal(300); // 5 minutes = 300 seconds
          n1.close();
          done();
        } catch (err) {
          n1.close();
          done(err);
        }
      });
    });

    it("should calculate poll frequency correctly for hours", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "poll1",
          type: "seqera-datalink-poll",
          name: "Test Datalink Poll",
          seqera: "config-node-1",
          dataLinkName: "my-datalink",
          dataLinkNameType: "str",
          pollFrequency: "2",
          pollUnits: "hours",
          wires: [[], []],
        },
      ];

      setupDatalinkMocks();

      helper.load([configNode, datalinkPollNode], flow, createCredentials(), function () {
        const n1 = helper.getNode("poll1");
        try {
          expect(n1.pollFrequencySec).to.equal(7200); // 2 hours = 7200 seconds
          n1.close();
          done();
        } catch (err) {
          n1.close();
          done(err);
        }
      });
    });

    it("should calculate poll frequency correctly for days", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "poll1",
          type: "seqera-datalink-poll",
          name: "Test Datalink Poll",
          seqera: "config-node-1",
          dataLinkName: "my-datalink",
          dataLinkNameType: "str",
          pollFrequency: "1",
          pollUnits: "days",
          wires: [[], []],
        },
      ];

      setupDatalinkMocks();

      helper.load([configNode, datalinkPollNode], flow, createCredentials(), function () {
        const n1 = helper.getNode("poll1");
        try {
          expect(n1.pollFrequencySec).to.equal(86400); // 1 day = 86400 seconds
          n1.close();
          done();
        } catch (err) {
          n1.close();
          done(err);
        }
      });
    });

    it("should default pollFrequency to 15 minutes", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "poll1",
          type: "seqera-datalink-poll",
          name: "Test Datalink Poll",
          seqera: "config-node-1",
          dataLinkName: "my-datalink",
          dataLinkNameType: "str",
          // No pollFrequency specified
          wires: [[], []],
        },
      ];

      setupDatalinkMocks();

      helper.load([configNode, datalinkPollNode], flow, createCredentials(), function () {
        const n1 = helper.getNode("poll1");
        try {
          expect(n1.pollFrequencySec).to.equal(900); // 15 minutes default = 900 seconds
          n1.close();
          done();
        } catch (err) {
          n1.close();
          done(err);
        }
      });
    });

    it("should store returnType configuration", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "poll1",
          type: "seqera-datalink-poll",
          name: "Test Datalink Poll",
          seqera: "config-node-1",
          dataLinkName: "my-datalink",
          dataLinkNameType: "str",
          returnType: "folders",
          wires: [[], []],
        },
      ];

      setupDatalinkMocks();

      helper.load([configNode, datalinkPollNode], flow, createCredentials(), function () {
        const n1 = helper.getNode("poll1");
        try {
          expect(n1.returnType).to.equal("folders");
          n1.close();
          done();
        } catch (err) {
          n1.close();
          done(err);
        }
      });
    });
  });

  describe("polling behavior", function () {
    it("should poll immediately on startup and send to output 1", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "poll1",
          type: "seqera-datalink-poll",
          name: "Test Datalink Poll",
          seqera: "config-node-1",
          dataLinkName: "my-datalink",
          dataLinkNameType: "str",
          pollFrequency: "60",
          pollUnits: "seconds",
          returnType: "all",
          outputAllPolls: true, // Enable 3-output mode: [All, New, Deleted]
          wires: [["helper1"], ["helper2"], []],
        },
        { id: "helper1", type: "helper" },
        { id: "helper2", type: "helper" },
      ];

      setupDatalinkMocks();

      helper.load([configNode, datalinkPollNode], flow, createCredentials(), function () {
        const pollNode = helper.getNode("poll1");
        const helper1 = helper.getNode("helper1");

        helper1.on("input", function (msg) {
          try {
            expect(msg.payload.files).to.be.an("array");
            expect(msg.payload.files.length).to.equal(2);
            expect(msg.files).to.be.an("array");
            expect(msg.files.length).to.equal(2);
            expect(msg.payload.nextPoll).to.be.a("string");
            expect(msg.payload.resourceRef).to.equal("s3://bucket/data");
            expect(msg.payload.provider).to.equal("aws");
            pollNode.close();
            done();
          } catch (err) {
            pollNode.close();
            done(err);
          }
        });
      });
    });

    it("should not start polling if dataLinkName is empty", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "poll1",
          type: "seqera-datalink-poll",
          name: "Test Datalink Poll",
          seqera: "config-node-1",
          dataLinkName: "",
          dataLinkNameType: "str",
          pollFrequency: "1",
          pollUnits: "seconds",
          wires: [["helper1"], []],
        },
        { id: "helper1", type: "helper" },
      ];

      // No API mocks needed - polling shouldn't start

      helper.load([configNode, datalinkPollNode], flow, createCredentials(), function () {
        const pollNode = helper.getNode("poll1");
        const helper1 = helper.getNode("helper1");

        let received = false;
        helper1.on("input", function (msg) {
          received = true;
        });

        // Wait and verify no message was received
        setTimeout(function () {
          try {
            expect(received).to.be.false;
            pollNode.close();
            done();
          } catch (err) {
            pollNode.close();
            done(err);
          }
        }, 1500);
      });
    });

    it("should not start polling if seqeraConfig is missing", function (done) {
      const flow = [
        {
          id: "poll1",
          type: "seqera-datalink-poll",
          name: "Test Datalink Poll",
          seqera: "", // No config node reference
          dataLinkName: "my-datalink",
          dataLinkNameType: "str",
          pollFrequency: "1",
          pollUnits: "seconds",
          wires: [["helper1"], []],
        },
        { id: "helper1", type: "helper" },
      ];

      helper.load([configNode, datalinkPollNode], flow, createCredentials(), function () {
        const pollNode = helper.getNode("poll1");
        const helper1 = helper.getNode("helper1");

        let received = false;
        helper1.on("input", function (msg) {
          received = true;
        });

        // Wait and verify no message was received
        setTimeout(function () {
          try {
            expect(received).to.be.false;
            pollNode.close();
            done();
          } catch (err) {
            pollNode.close();
            done(err);
          }
        }, 1500);
      });
    });
  });

  describe("new file detection", function () {
    it("should detect new files on subsequent polls", function (done) {
      this.timeout(5000);

      const flow = [
        createConfigNode(),
        {
          id: "poll1",
          type: "seqera-datalink-poll",
          name: "Test Datalink Poll",
          seqera: "config-node-1",
          dataLinkName: "my-datalink",
          dataLinkNameType: "str",
          pollFrequency: "1",
          pollUnits: "seconds",
          returnType: "all",
          outputAllPolls: true, // Enable 3-output mode: [All, New, Deleted]
          wires: [["helper1"], ["helper2"], []],
        },
        { id: "helper1", type: "helper" },
        { id: "helper2", type: "helper" },
      ];

      let pollCount = 0;

      nock(DEFAULT_BASE_URL)
        .get("/data-links/")
        .query(true)
        .reply(
          200,
          createDataLinksResponse([
            { id: "dl-123", name: "my-datalink", provider: "aws", resourceRef: "s3://bucket/data", credentials: [] },
          ]),
        )
        .persist();

      // First poll: return 2 files
      // Second poll: return 3 files (1 new one)
      nock(DEFAULT_BASE_URL)
        .get(/\/data-links\/dl-123\/browse/)
        .query(true)
        .reply(200, function () {
          pollCount++;
          if (pollCount === 1) {
            return createDataBrowserResponse([
              { name: "file1.txt", type: "FILE", size: 1024 },
              { name: "file2.csv", type: "FILE", size: 2048 },
            ]);
          }
          return createDataBrowserResponse([
            { name: "file1.txt", type: "FILE", size: 1024 },
            { name: "file2.csv", type: "FILE", size: 2048 },
            { name: "file3-new.txt", type: "FILE", size: 512 },
          ]);
        })
        .persist();

      helper.load([configNode, datalinkPollNode], flow, createCredentials(), function () {
        const pollNode = helper.getNode("poll1");
        const helper2 = helper.getNode("helper2");

        helper2.on("input", function (msg) {
          try {
            // Output 2 should only contain the new file
            expect(msg.payload.files).to.have.length(1);
            expect(msg.payload.files[0].name).to.equal("file3-new.txt");
            expect(msg.files).to.have.length(1);
            expect(msg.files[0]).to.include("file3-new.txt");
            pollNode.close();
            done();
          } catch (err) {
            pollNode.close();
            done(err);
          }
        });
      });
    });

    it("should not send to output 2 on first poll (no previous cache)", function (done) {
      this.timeout(3000);

      const flow = [
        createConfigNode(),
        {
          id: "poll1",
          type: "seqera-datalink-poll",
          name: "Test Datalink Poll",
          seqera: "config-node-1",
          dataLinkName: "my-datalink",
          dataLinkNameType: "str",
          pollFrequency: "60",
          pollUnits: "seconds",
          returnType: "all",
          outputAllPolls: true, // Enable 3-output mode: [All, New, Deleted]
          wires: [["helper1"], ["helper2"], []],
        },
        { id: "helper1", type: "helper" },
        { id: "helper2", type: "helper" },
      ];

      setupDatalinkMocks();

      helper.load([configNode, datalinkPollNode], flow, createCredentials(), function () {
        const pollNode = helper.getNode("poll1");
        const helper1 = helper.getNode("helper1");
        const helper2 = helper.getNode("helper2");

        let output1Received = false;
        let output2Received = false;

        helper1.on("input", function (msg) {
          output1Received = true;
        });

        helper2.on("input", function (msg) {
          output2Received = true;
        });

        // Wait a bit and verify output 2 was not triggered
        setTimeout(function () {
          try {
            expect(output1Received).to.be.true;
            expect(output2Received).to.be.false;
            pollNode.close();
            done();
          } catch (err) {
            pollNode.close();
            done(err);
          }
        }, 1000);
      });
    });

    it("should detect multiple new files", function (done) {
      this.timeout(5000);

      const flow = [
        createConfigNode(),
        {
          id: "poll1",
          type: "seqera-datalink-poll",
          name: "Test Datalink Poll",
          seqera: "config-node-1",
          dataLinkName: "my-datalink",
          dataLinkNameType: "str",
          pollFrequency: "1",
          pollUnits: "seconds",
          returnType: "all",
          outputAllPolls: true, // Enable 3-output mode: [All, New, Deleted]
          wires: [["helper1"], ["helper2"], []],
        },
        { id: "helper1", type: "helper" },
        { id: "helper2", type: "helper" },
      ];

      let pollCount = 0;

      nock(DEFAULT_BASE_URL)
        .get("/data-links/")
        .query(true)
        .reply(
          200,
          createDataLinksResponse([
            { id: "dl-123", name: "my-datalink", provider: "aws", resourceRef: "s3://bucket/data", credentials: [] },
          ]),
        )
        .persist();

      nock(DEFAULT_BASE_URL)
        .get(/\/data-links\/dl-123\/browse/)
        .query(true)
        .reply(200, function () {
          pollCount++;
          if (pollCount === 1) {
            return createDataBrowserResponse([{ name: "file1.txt", type: "FILE", size: 1024 }]);
          }
          // Add 3 new files
          return createDataBrowserResponse([
            { name: "file1.txt", type: "FILE", size: 1024 },
            { name: "new-file-a.txt", type: "FILE", size: 100 },
            { name: "new-file-b.txt", type: "FILE", size: 200 },
            { name: "new-file-c.txt", type: "FILE", size: 300 },
          ]);
        })
        .persist();

      helper.load([configNode, datalinkPollNode], flow, createCredentials(), function () {
        const pollNode = helper.getNode("poll1");
        const helper2 = helper.getNode("helper2");

        helper2.on("input", function (msg) {
          try {
            expect(msg.payload.files).to.have.length(3);
            const names = msg.payload.files.map((f) => f.name);
            expect(names).to.include("new-file-a.txt");
            expect(names).to.include("new-file-b.txt");
            expect(names).to.include("new-file-c.txt");
            pollNode.close();
            done();
          } catch (err) {
            pollNode.close();
            done(err);
          }
        });
      });
    });
  });

  describe("output format", function () {
    it("should include resourceType and resourceRef in output", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "poll1",
          type: "seqera-datalink-poll",
          name: "Test Datalink Poll",
          seqera: "config-node-1",
          dataLinkName: "my-datalink",
          dataLinkNameType: "str",
          pollFrequency: "60",
          pollUnits: "seconds",
          returnType: "all",
          outputAllPolls: true, // Enable 3-output mode: [All, New, Deleted]
          wires: [["helper1"], [], []],
        },
        { id: "helper1", type: "helper" },
      ];

      setupDatalinkMocks();

      helper.load([configNode, datalinkPollNode], flow, createCredentials(), function () {
        const pollNode = helper.getNode("poll1");
        const helper1 = helper.getNode("helper1");

        helper1.on("input", function (msg) {
          try {
            expect(msg.payload.resourceType).to.exist;
            expect(msg.payload.resourceRef).to.equal("s3://bucket/data");
            expect(msg.payload.provider).to.equal("aws");
            pollNode.close();
            done();
          } catch (err) {
            pollNode.close();
            done(err);
          }
        });
      });
    });

    it("should include full paths in files array", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "poll1",
          type: "seqera-datalink-poll",
          name: "Test Datalink Poll",
          seqera: "config-node-1",
          dataLinkName: "my-datalink",
          dataLinkNameType: "str",
          pollFrequency: "60",
          pollUnits: "seconds",
          returnType: "all",
          outputAllPolls: true, // Enable 3-output mode: [All, New, Deleted]
          wires: [["helper1"], [], []],
        },
        { id: "helper1", type: "helper" },
      ];

      setupDatalinkMocks([{ name: "subdir/file.txt", type: "FILE", size: 100 }]);

      helper.load([configNode, datalinkPollNode], flow, createCredentials(), function () {
        const pollNode = helper.getNode("poll1");
        const helper1 = helper.getNode("helper1");

        helper1.on("input", function (msg) {
          try {
            expect(msg.files[0]).to.equal("s3://bucket/data/subdir/file.txt");
            pollNode.close();
            done();
          } catch (err) {
            pollNode.close();
            done(err);
          }
        });
      });
    });
  });

  describe("error handling", function () {
    it("should set error status on API failure", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "poll1",
          type: "seqera-datalink-poll",
          name: "Test Datalink Poll",
          seqera: "config-node-1",
          dataLinkName: "my-datalink",
          dataLinkNameType: "str",
          pollFrequency: "60",
          pollUnits: "seconds",
          wires: [[], []],
        },
      ];

      nock(DEFAULT_BASE_URL).get("/data-links/").query(true).reply(500, { error: "Server error" });

      helper.load([configNode, datalinkPollNode], flow, createCredentials(), function () {
        const pollNode = helper.getNode("poll1");

        pollNode.on("call:error", function (call) {
          try {
            expect(call.firstArg).to.include("Seqera datalink poll failed");
            pollNode.close();
            done();
          } catch (err) {
            pollNode.close();
            done(err);
          }
        });
      });
    });

    it("should handle datalink not found error", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "poll1",
          type: "seqera-datalink-poll",
          name: "Test Datalink Poll",
          seqera: "config-node-1",
          dataLinkName: "nonexistent",
          dataLinkNameType: "str",
          pollFrequency: "60",
          pollUnits: "seconds",
          wires: [[], []],
        },
      ];

      nock(DEFAULT_BASE_URL).get("/data-links/").query(true).reply(200, { dataLinks: [] });

      helper.load([configNode, datalinkPollNode], flow, createCredentials(), function () {
        const pollNode = helper.getNode("poll1");

        pollNode.on("call:error", function (call) {
          try {
            expect(call.firstArg).to.include("Seqera datalink poll failed");
            pollNode.close();
            done();
          } catch (err) {
            pollNode.close();
            done(err);
          }
        });
      });
    });
  });

  describe("deleted file detection", function () {
    it("should detect deleted files on subsequent polls", function (done) {
      this.timeout(5000);

      const flow = [
        createConfigNode(),
        {
          id: "poll1",
          type: "seqera-datalink-poll",
          name: "Test Datalink Poll",
          seqera: "config-node-1",
          dataLinkName: "my-datalink",
          dataLinkNameType: "str",
          pollFrequency: "1",
          pollUnits: "seconds",
          returnType: "all",
          outputAllPolls: true, // Enable 3-output mode: [All, New, Deleted]
          wires: [[], [], ["helper3"]],
        },
        { id: "helper3", type: "helper" },
      ];

      let pollCount = 0;

      nock(DEFAULT_BASE_URL)
        .get("/data-links/")
        .query(true)
        .reply(
          200,
          createDataLinksResponse([
            { id: "dl-123", name: "my-datalink", provider: "aws", resourceRef: "s3://bucket/data", credentials: [] },
          ]),
        )
        .persist();

      // First poll: return 3 files
      // Second poll: return 2 files (1 deleted)
      nock(DEFAULT_BASE_URL)
        .get(/\/data-links\/dl-123\/browse/)
        .query(true)
        .reply(200, function () {
          pollCount++;
          if (pollCount === 1) {
            return createDataBrowserResponse([
              { name: "file1.txt", type: "FILE", size: 1024 },
              { name: "file2.csv", type: "FILE", size: 2048 },
              { name: "file3.txt", type: "FILE", size: 512 },
            ]);
          }
          // file2.csv is deleted
          return createDataBrowserResponse([
            { name: "file1.txt", type: "FILE", size: 1024 },
            { name: "file3.txt", type: "FILE", size: 512 },
          ]);
        })
        .persist();

      helper.load([configNode, datalinkPollNode], flow, createCredentials(), function () {
        const pollNode = helper.getNode("poll1");
        const helper3 = helper.getNode("helper3");

        helper3.on("input", function (msg) {
          try {
            // Output 3 should only contain the deleted file
            expect(msg.payload.files).to.have.length(1);
            expect(msg.payload.files[0].name).to.equal("file2.csv");
            expect(msg.files).to.have.length(1);
            expect(msg.files[0]).to.include("file2.csv");
            pollNode.close();
            done();
          } catch (err) {
            pollNode.close();
            done(err);
          }
        });
      });
    });

    it("should detect multiple deleted files", function (done) {
      this.timeout(5000);

      const flow = [
        createConfigNode(),
        {
          id: "poll1",
          type: "seqera-datalink-poll",
          name: "Test Datalink Poll",
          seqera: "config-node-1",
          dataLinkName: "my-datalink",
          dataLinkNameType: "str",
          pollFrequency: "1",
          pollUnits: "seconds",
          returnType: "all",
          outputAllPolls: true, // Enable 3-output mode: [All, New, Deleted]
          wires: [[], [], ["helper3"]],
        },
        { id: "helper3", type: "helper" },
      ];

      let pollCount = 0;

      nock(DEFAULT_BASE_URL)
        .get("/data-links/")
        .query(true)
        .reply(
          200,
          createDataLinksResponse([
            { id: "dl-123", name: "my-datalink", provider: "aws", resourceRef: "s3://bucket/data", credentials: [] },
          ]),
        )
        .persist();

      nock(DEFAULT_BASE_URL)
        .get(/\/data-links\/dl-123\/browse/)
        .query(true)
        .reply(200, function () {
          pollCount++;
          if (pollCount === 1) {
            return createDataBrowserResponse([
              { name: "file1.txt", type: "FILE", size: 1024 },
              { name: "file2.csv", type: "FILE", size: 2048 },
              { name: "file3.txt", type: "FILE", size: 512 },
              { name: "file4.txt", type: "FILE", size: 256 },
            ]);
          }
          // Keep only file1.txt, delete the rest
          return createDataBrowserResponse([{ name: "file1.txt", type: "FILE", size: 1024 }]);
        })
        .persist();

      helper.load([configNode, datalinkPollNode], flow, createCredentials(), function () {
        const pollNode = helper.getNode("poll1");
        const helper3 = helper.getNode("helper3");

        helper3.on("input", function (msg) {
          try {
            expect(msg.payload.files).to.have.length(3);
            const names = msg.payload.files.map((f) => f.name);
            expect(names).to.include("file2.csv");
            expect(names).to.include("file3.txt");
            expect(names).to.include("file4.txt");
            pollNode.close();
            done();
          } catch (err) {
            pollNode.close();
            done(err);
          }
        });
      });
    });

    it("should not send to deleted output on first poll", function (done) {
      this.timeout(3000);

      const flow = [
        createConfigNode(),
        {
          id: "poll1",
          type: "seqera-datalink-poll",
          name: "Test Datalink Poll",
          seqera: "config-node-1",
          dataLinkName: "my-datalink",
          dataLinkNameType: "str",
          pollFrequency: "60",
          pollUnits: "seconds",
          returnType: "all",
          outputAllPolls: true, // Enable 3-output mode: [All, New, Deleted]
          wires: [["helper1"], [], ["helper3"]],
        },
        { id: "helper1", type: "helper" },
        { id: "helper3", type: "helper" },
      ];

      setupDatalinkMocks();

      helper.load([configNode, datalinkPollNode], flow, createCredentials(), function () {
        const pollNode = helper.getNode("poll1");
        const helper1 = helper.getNode("helper1");
        const helper3 = helper.getNode("helper3");

        let output1Received = false;
        let output3Received = false;

        helper1.on("input", function (msg) {
          output1Received = true;
        });

        helper3.on("input", function (msg) {
          output3Received = true;
        });

        // Wait a bit and verify output 3 was not triggered
        setTimeout(function () {
          try {
            expect(output1Received).to.be.true;
            expect(output3Received).to.be.false;
            pollNode.close();
            done();
          } catch (err) {
            pollNode.close();
            done(err);
          }
        }, 1000);
      });
    });
  });

  describe("outputAllPolls configuration", function () {
    it("should default outputAllPolls to false", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "poll1",
          type: "seqera-datalink-poll",
          name: "Test Datalink Poll",
          seqera: "config-node-1",
          dataLinkName: "my-datalink",
          dataLinkNameType: "str",
          pollFrequency: "15",
          pollUnits: "minutes",
          // outputAllPolls not specified
          wires: [[], []],
        },
      ];

      setupDatalinkMocks();

      helper.load([configNode, datalinkPollNode], flow, createCredentials(), function () {
        const n1 = helper.getNode("poll1");
        try {
          expect(n1.outputAllPolls).to.be.false;
          n1.close();
          done();
        } catch (err) {
          n1.close();
          done(err);
        }
      });
    });

    it("should use 2-output mode when outputAllPolls is false", function (done) {
      this.timeout(5000);

      const flow = [
        createConfigNode(),
        {
          id: "poll1",
          type: "seqera-datalink-poll",
          name: "Test Datalink Poll",
          seqera: "config-node-1",
          dataLinkName: "two-output-datalink", // Use unique name to avoid mock conflicts
          dataLinkNameType: "str",
          pollFrequency: "1",
          pollUnits: "seconds",
          returnType: "all",
          outputAllPolls: false, // 2-output mode: [New, Deleted]
          wires: [["helper1"], ["helper2"]],
        },
        { id: "helper1", type: "helper" },
        { id: "helper2", type: "helper" },
      ];

      let pollCount = 0;

      nock(DEFAULT_BASE_URL)
        .get("/data-links/")
        .query((query) => query.search === "two-output-datalink")
        .reply(
          200,
          createDataLinksResponse([
            {
              id: "dl-two-output",
              name: "two-output-datalink",
              provider: "aws",
              resourceRef: "s3://bucket/two-output",
              credentials: [],
            },
          ]),
        )
        .persist();

      // First poll: return 2 files
      // Second poll: return 3 files (1 new)
      nock(DEFAULT_BASE_URL)
        .get(/\/data-links\/dl-two-output\/browse/)
        .query(true)
        .reply(200, function () {
          pollCount++;
          if (pollCount === 1) {
            return createDataBrowserResponse([
              { name: "file1.txt", type: "FILE", size: 1024 },
              { name: "file2.csv", type: "FILE", size: 2048 },
            ]);
          }
          // Add file3.txt as new
          return createDataBrowserResponse([
            { name: "file1.txt", type: "FILE", size: 1024 },
            { name: "file2.csv", type: "FILE", size: 2048 },
            { name: "file3-new.txt", type: "FILE", size: 512 },
          ]);
        })
        .persist();

      helper.load([configNode, datalinkPollNode], flow, createCredentials(), function () {
        const pollNode = helper.getNode("poll1");
        const helper1 = helper.getNode("helper1"); // New results (output 1 in 2-output mode)

        helper1.on("input", function (msg) {
          try {
            // In 2-output mode, output 1 is "New results"
            expect(msg.payload.files).to.have.length(1);
            expect(msg.payload.files[0].name).to.equal("file3-new.txt");
            pollNode.close();
            done();
          } catch (err) {
            pollNode.close();
            done(err);
          }
        });
      });
    });

    it("should include pollIntervalSeconds in All results output", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "poll1",
          type: "seqera-datalink-poll",
          name: "Test Datalink Poll",
          seqera: "config-node-1",
          dataLinkName: "my-datalink",
          dataLinkNameType: "str",
          pollFrequency: "5",
          pollUnits: "minutes",
          returnType: "all",
          outputAllPolls: true, // Enable 3-output mode to get All results output
          wires: [["helper1"], [], []],
        },
        { id: "helper1", type: "helper" },
      ];

      setupDatalinkMocks();

      helper.load([configNode, datalinkPollNode], flow, createCredentials(), function () {
        const pollNode = helper.getNode("poll1");
        const helper1 = helper.getNode("helper1");

        helper1.on("input", function (msg) {
          try {
            expect(msg.payload.pollIntervalSeconds).to.equal(300); // 5 minutes = 300 seconds
            expect(msg.payload.nextPoll).to.be.a("string");
            pollNode.close();
            done();
          } catch (err) {
            pollNode.close();
            done(err);
          }
        });
      });
    });
  });

  describe("cleanup on close", function () {
    it("should clear interval when node is closed", function (done) {
      this.timeout(5000);

      const flow = [
        createConfigNode(),
        {
          id: "poll1",
          type: "seqera-datalink-poll",
          name: "Test Datalink Poll",
          seqera: "config-node-1",
          dataLinkName: "my-datalink",
          dataLinkNameType: "str",
          pollFrequency: "1",
          pollUnits: "seconds",
          returnType: "all",
          outputAllPolls: true, // Enable 3-output mode: [All, New, Deleted]
          wires: [["helper1"], [], []],
        },
        { id: "helper1", type: "helper" },
      ];

      let pollCount = 0;

      nock(DEFAULT_BASE_URL)
        .get("/data-links/")
        .query(true)
        .reply(
          200,
          createDataLinksResponse([
            { id: "dl-123", name: "my-datalink", provider: "aws", resourceRef: "s3://bucket/data", credentials: [] },
          ]),
        )
        .persist();

      nock(DEFAULT_BASE_URL)
        .get(/\/data-links\/dl-123\/browse/)
        .query(true)
        .reply(200, function () {
          pollCount++;
          return createDataBrowserResponse([{ name: "file1.txt", type: "FILE" }]);
        })
        .persist();

      helper.load([configNode, datalinkPollNode], flow, createCredentials(), function () {
        const pollNode = helper.getNode("poll1");
        const helper1 = helper.getNode("helper1");

        helper1.on("input", function (msg) {
          // Close after first poll
          pollNode.close();

          // Wait and verify no more polls happen
          setTimeout(function () {
            try {
              expect(pollCount).to.equal(1);
              done();
            } catch (err) {
              done(err);
            }
          }, 2500);
        });
      });
    });
  });
});
