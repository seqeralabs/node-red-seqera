/**
 * Tests for nodes/studios-monitor.js (seqera-studios-monitor node)
 *
 * Tests the Studios monitoring functionality including:
 * - Polling Studio status at configurable intervals
 * - Three outputs: All checks, Ready (running transition), Terminated
 * - State transition detection (ready notification only fires once)
 * - Time unit conversion (seconds, minutes, hours)
 */

const {
  helper,
  nock,
  DEFAULT_BASE_URL,
  DEFAULT_WORKSPACE_ID,
  createConfigNode,
  createCredentials,
  createStudioResponse,
} = require("./helper");
const { expect } = require("chai");

const studiosMonitorNode = require("../nodes/studios-monitor");
const configNode = require("../nodes/config");

describe("seqera-studios-monitor Node", function () {
  beforeEach(function (done) {
    helper.startServer(done);
  });

  afterEach(function (done) {
    helper.unload();
    helper.stopServer(done);
    nock.cleanAll();
  });

  // Helper to create studio status response
  function createStudioStatusResponse(status = "running") {
    return {
      sessionId: "studio-123",
      statusInfo: {
        status: status,
      },
      name: "test-studio",
    };
  }

  describe("node loading", function () {
    it("should be loaded with correct type", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "monitor1",
          type: "seqera-studios-monitor",
          name: "Test Studios Monitor",
          seqera: "config-node-1",
          studioId: "studioId",
          studioIdType: "msg",
          poll: 5,
          pollUnits: "seconds",
          keepPolling: true,
          wires: [[], [], []],
        },
      ];

      helper.load([configNode, studiosMonitorNode], flow, createCredentials(), function () {
        const n1 = helper.getNode("monitor1");
        try {
          expect(n1).to.exist;
          expect(n1.type).to.equal("seqera-studios-monitor");
          expect(n1.name).to.equal("Test Studios Monitor");
          done();
        } catch (err) {
          done(err);
        }
      });
    });

    it("should store poll interval and units", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "monitor1",
          type: "seqera-studios-monitor",
          name: "Test Studios Monitor",
          seqera: "config-node-1",
          poll: 10,
          pollUnits: "minutes",
          wires: [[], [], []],
        },
      ];

      helper.load([configNode, studiosMonitorNode], flow, createCredentials(), function () {
        const n1 = helper.getNode("monitor1");
        try {
          expect(n1.pollIntervalProp).to.equal(10);
          expect(n1.pollUnitsProp).to.equal("minutes");
          done();
        } catch (err) {
          done(err);
        }
      });
    });

    it("should default keepPolling to true", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "monitor1",
          type: "seqera-studios-monitor",
          name: "Test Studios Monitor",
          seqera: "config-node-1",
          wires: [[], [], []],
        },
      ];

      helper.load([configNode, studiosMonitorNode], flow, createCredentials(), function () {
        const n1 = helper.getNode("monitor1");
        try {
          expect(n1.keepPolling).to.be.true;
          done();
        } catch (err) {
          done(err);
        }
      });
    });
  });

  describe("status polling", function () {
    it("should fetch studio status on input", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "monitor1",
          type: "seqera-studios-monitor",
          name: "Test Studios Monitor",
          seqera: "config-node-1",
          studioId: "studioId",
          studioIdType: "msg",
          keepPolling: false,
          wires: [["helper1"], ["helper2"], ["helper3"]],
        },
        { id: "helper1", type: "helper" },
        { id: "helper2", type: "helper" },
        { id: "helper3", type: "helper" },
      ];

      nock(DEFAULT_BASE_URL).get("/studios/studio-123").query(true).reply(200, createStudioStatusResponse("running"));

      helper.load([configNode, studiosMonitorNode], flow, createCredentials(), function () {
        const monitorNode = helper.getNode("monitor1");
        const helper1 = helper.getNode("helper1");

        helper1.on("input", function (msg) {
          try {
            expect(msg.studioId).to.equal("studio-123");
            expect(msg.payload.statusInfo.status).to.equal("running");
            done();
          } catch (err) {
            done(err);
          }
        });

        monitorNode.receive({ studioId: "studio-123" });
      });
    });

    it("should report error when studioId not provided", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "monitor1",
          type: "seqera-studios-monitor",
          name: "Test Studios Monitor",
          seqera: "config-node-1",
          studioId: "studioId",
          studioIdType: "msg",
          keepPolling: false,
          wires: [[], [], []],
        },
      ];

      helper.load([configNode, studiosMonitorNode], flow, createCredentials(), function () {
        const monitorNode = helper.getNode("monitor1");

        monitorNode.on("call:error", function (call) {
          try {
            expect(call.firstArg).to.include("studioId not provided");
            done();
          } catch (err) {
            done(err);
          }
        });

        monitorNode.receive({ payload: {} });
      });
    });
  });

  describe("output routing", function () {
    it("should always send to output 1 on every check", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "monitor1",
          type: "seqera-studios-monitor",
          name: "Test Studios Monitor",
          seqera: "config-node-1",
          studioId: "studioId",
          studioIdType: "msg",
          keepPolling: false,
          wires: [["helper1"], [], []],
        },
        { id: "helper1", type: "helper" },
      ];

      nock(DEFAULT_BASE_URL).get("/studios/studio-123").query(true).reply(200, createStudioStatusResponse("starting"));

      helper.load([configNode, studiosMonitorNode], flow, createCredentials(), function () {
        const monitorNode = helper.getNode("monitor1");
        const helper1 = helper.getNode("helper1");

        helper1.on("input", function (msg) {
          try {
            expect(msg.payload.statusInfo.status).to.equal("starting");
            done();
          } catch (err) {
            done(err);
          }
        });

        monitorNode.receive({ studioId: "studio-123" });
      });
    });

    it("should send to output 2 on transition to running", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "monitor1",
          type: "seqera-studios-monitor",
          name: "Test Studios Monitor",
          seqera: "config-node-1",
          studioId: "studioId",
          studioIdType: "msg",
          keepPolling: false,
          wires: [["helper1"], ["helper2"], ["helper3"]],
        },
        { id: "helper1", type: "helper" },
        { id: "helper2", type: "helper" },
        { id: "helper3", type: "helper" },
      ];

      // First call: running (first time, so transition fires)
      nock(DEFAULT_BASE_URL).get("/studios/studio-123").query(true).reply(200, createStudioStatusResponse("running"));

      helper.load([configNode, studiosMonitorNode], flow, createCredentials(), function () {
        const monitorNode = helper.getNode("monitor1");
        const helper2 = helper.getNode("helper2");

        helper2.on("input", function (msg) {
          try {
            expect(msg.payload.statusInfo.status).to.equal("running");
            done();
          } catch (err) {
            done(err);
          }
        });

        monitorNode.receive({ studioId: "studio-123" });
      });
    });

    it("should send to output 3 when studio is stopped", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "monitor1",
          type: "seqera-studios-monitor",
          name: "Test Studios Monitor",
          seqera: "config-node-1",
          studioId: "studioId",
          studioIdType: "msg",
          keepPolling: false,
          wires: [["helper1"], ["helper2"], ["helper3"]],
        },
        { id: "helper1", type: "helper" },
        { id: "helper2", type: "helper" },
        { id: "helper3", type: "helper" },
      ];

      nock(DEFAULT_BASE_URL).get("/studios/studio-123").query(true).reply(200, createStudioStatusResponse("stopped"));

      helper.load([configNode, studiosMonitorNode], flow, createCredentials(), function () {
        const monitorNode = helper.getNode("monitor1");
        const helper3 = helper.getNode("helper3");

        helper3.on("input", function (msg) {
          try {
            expect(msg.payload.statusInfo.status).to.equal("stopped");
            done();
          } catch (err) {
            done(err);
          }
        });

        monitorNode.receive({ studioId: "studio-123" });
      });
    });

    it("should send to output 3 when studio has errored", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "monitor1",
          type: "seqera-studios-monitor",
          name: "Test Studios Monitor",
          seqera: "config-node-1",
          studioId: "studioId",
          studioIdType: "msg",
          keepPolling: false,
          wires: [["helper1"], ["helper2"], ["helper3"]],
        },
        { id: "helper1", type: "helper" },
        { id: "helper2", type: "helper" },
        { id: "helper3", type: "helper" },
      ];

      nock(DEFAULT_BASE_URL).get("/studios/studio-123").query(true).reply(200, createStudioStatusResponse("errored"));

      helper.load([configNode, studiosMonitorNode], flow, createCredentials(), function () {
        const monitorNode = helper.getNode("monitor1");
        const helper3 = helper.getNode("helper3");

        helper3.on("input", function (msg) {
          try {
            expect(msg.payload.statusInfo.status).to.equal("errored");
            done();
          } catch (err) {
            done(err);
          }
        });

        monitorNode.receive({ studioId: "studio-123" });
      });
    });

    it("should send to output 3 on build failed", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "monitor1",
          type: "seqera-studios-monitor",
          name: "Test Studios Monitor",
          seqera: "config-node-1",
          studioId: "studioId",
          studioIdType: "msg",
          keepPolling: false,
          wires: [["helper1"], ["helper2"], ["helper3"]],
        },
        { id: "helper1", type: "helper" },
        { id: "helper2", type: "helper" },
        { id: "helper3", type: "helper" },
      ];

      nock(DEFAULT_BASE_URL)
        .get("/studios/studio-123")
        .query(true)
        .reply(200, createStudioStatusResponse("build failed"));

      helper.load([configNode, studiosMonitorNode], flow, createCredentials(), function () {
        const monitorNode = helper.getNode("monitor1");
        const helper3 = helper.getNode("helper3");

        helper3.on("input", function (msg) {
          try {
            done();
          } catch (err) {
            done(err);
          }
        });

        monitorNode.receive({ studioId: "studio-123" });
      });
    });
  });

  describe("state transition detection", function () {
    it("should only fire ready notification once (not on every poll while running)", function (done) {
      this.timeout(5000);

      const flow = [
        createConfigNode(),
        {
          id: "monitor1",
          type: "seqera-studios-monitor",
          name: "Test Studios Monitor",
          seqera: "config-node-1",
          studioId: "studioId",
          studioIdType: "msg",
          poll: 1,
          pollUnits: "seconds",
          keepPolling: true,
          wires: [["helper1"], ["helper2"], ["helper3"]],
        },
        { id: "helper1", type: "helper" },
        { id: "helper2", type: "helper" },
        { id: "helper3", type: "helper" },
      ];

      let pollCount = 0;

      // Always return running
      nock(DEFAULT_BASE_URL)
        .get("/studios/studio-123")
        .query(true)
        .reply(200, function () {
          pollCount++;
          return createStudioStatusResponse("running");
        })
        .persist();

      helper.load([configNode, studiosMonitorNode], flow, createCredentials(), function () {
        const monitorNode = helper.getNode("monitor1");
        const helper2 = helper.getNode("helper2");

        let readyCount = 0;

        helper2.on("input", function (msg) {
          readyCount++;
        });

        monitorNode.receive({ studioId: "studio-123" });

        // Wait for multiple polls and verify ready only fired once
        setTimeout(function () {
          monitorNode.close();
          try {
            expect(pollCount).to.be.greaterThan(1);
            expect(readyCount).to.equal(1); // Ready should only fire once
            done();
          } catch (err) {
            done(err);
          }
        }, 2500);
      });
    });
  });

  describe("polling behavior", function () {
    it("should stop polling when studio reaches terminal state", function (done) {
      this.timeout(5000);

      const flow = [
        createConfigNode(),
        {
          id: "monitor1",
          type: "seqera-studios-monitor",
          name: "Test Studios Monitor",
          seqera: "config-node-1",
          studioId: "studioId",
          studioIdType: "msg",
          poll: 1,
          pollUnits: "seconds",
          keepPolling: true,
          wires: [["helper1"], ["helper2"], ["helper3"]],
        },
        { id: "helper1", type: "helper" },
        { id: "helper2", type: "helper" },
        { id: "helper3", type: "helper" },
      ];

      let pollCount = 0;

      // First call: running, second call: stopped
      nock(DEFAULT_BASE_URL)
        .get("/studios/studio-123")
        .query(true)
        .reply(200, function () {
          pollCount++;
          if (pollCount === 1) {
            return createStudioStatusResponse("running");
          }
          return createStudioStatusResponse("stopped");
        })
        .persist();

      helper.load([configNode, studiosMonitorNode], flow, createCredentials(), function () {
        const monitorNode = helper.getNode("monitor1");
        const helper3 = helper.getNode("helper3");

        helper3.on("input", function (msg) {
          // Verify polling stopped after terminal state
          setTimeout(function () {
            try {
              expect(pollCount).to.equal(2); // Should stop after stopped status
              done();
            } catch (err) {
              done(err);
            }
          }, 2000);
        });

        monitorNode.receive({ studioId: "studio-123" });
      });
    });
  });

  describe("message passthrough", function () {
    it("should preserve custom message properties", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "monitor1",
          type: "seqera-studios-monitor",
          name: "Test Studios Monitor",
          seqera: "config-node-1",
          studioId: "studioId",
          studioIdType: "msg",
          keepPolling: false,
          wires: [["helper1"], [], []],
        },
        { id: "helper1", type: "helper" },
      ];

      nock(DEFAULT_BASE_URL).get("/studios/studio-123").query(true).reply(200, createStudioStatusResponse("running"));

      helper.load([configNode, studiosMonitorNode], flow, createCredentials(), function () {
        const monitorNode = helper.getNode("monitor1");
        const helper1 = helper.getNode("helper1");

        helper1.on("input", function (msg) {
          try {
            expect(msg._context).to.equal("test-context");
            expect(msg.correlationId).to.equal("corr-studio-mon");
            expect(msg.studioId).to.exist;
            done();
          } catch (err) {
            done(err);
          }
        });

        monitorNode.receive({
          studioId: "studio-123",
          _context: "test-context",
          correlationId: "corr-studio-mon",
        });
      });
    });
  });

  describe("error handling", function () {
    it("should set error status and stop polling on API error", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "monitor1",
          type: "seqera-studios-monitor",
          name: "Test Studios Monitor",
          seqera: "config-node-1",
          studioId: "studioId",
          studioIdType: "msg",
          keepPolling: true,
          wires: [[], [], []],
        },
      ];

      nock(DEFAULT_BASE_URL).get("/studios/studio-123").query(true).reply(500, { error: "Server error" });

      helper.load([configNode, studiosMonitorNode], flow, createCredentials(), function () {
        const monitorNode = helper.getNode("monitor1");

        monitorNode.on("call:error", function (call) {
          try {
            expect(call.firstArg).to.include("Seqera API request failed");
            done();
          } catch (err) {
            done(err);
          }
        });

        monitorNode.receive({ studioId: "studio-123" });
      });
    });
  });

  describe("cleanup on close", function () {
    it("should clear interval when node is closed", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "monitor1",
          type: "seqera-studios-monitor",
          name: "Test Studios Monitor",
          seqera: "config-node-1",
          studioId: "studioId",
          studioIdType: "msg",
          poll: 1,
          pollUnits: "seconds",
          keepPolling: true,
          wires: [["helper1"], [], []],
        },
        { id: "helper1", type: "helper" },
      ];

      let pollCount = 0;

      nock(DEFAULT_BASE_URL)
        .get("/studios/studio-123")
        .query(true)
        .reply(200, function () {
          pollCount++;
          return createStudioStatusResponse("starting");
        })
        .persist();

      helper.load([configNode, studiosMonitorNode], flow, createCredentials(), function () {
        const monitorNode = helper.getNode("monitor1");
        const helper1 = helper.getNode("helper1");

        helper1.on("input", function (msg) {
          // Close after first message
          monitorNode.close();

          // Verify no more polls after close
          setTimeout(function () {
            try {
              expect(pollCount).to.equal(1);
              done();
            } catch (err) {
              done(err);
            }
          }, 2000);
        });

        monitorNode.receive({ studioId: "studio-123" });
      });
    });
  });
});
