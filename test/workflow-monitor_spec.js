/**
 * Tests for nodes/workflow-monitor.js (seqera-workflow-monitor node)
 *
 * Tests the workflow monitoring functionality including:
 * - Polling workflow status at configurable intervals
 * - Three outputs: Active (running), Succeeded, Failed/Cancelled
 * - Status color mapping
 * - Interval cleanup on completion or close
 */

const {
  helper,
  nock,
  DEFAULT_BASE_URL,
  DEFAULT_WORKSPACE_ID,
  createConfigNode,
  createCredentials,
  createWorkflowResponse,
} = require("./helper");
const { expect } = require("chai");
const sinon = require("sinon");

const workflowMonitorNode = require("../nodes/workflow-monitor");
const configNode = require("../nodes/config");

describe("seqera-workflow-monitor Node", function () {
  let clock;

  beforeEach(function (done) {
    helper.startServer(done);
  });

  afterEach(function (done) {
    if (clock) {
      clock.restore();
      clock = null;
    }
    helper.unload();
    helper.stopServer(done);
    nock.cleanAll();
  });

  describe("node loading", function () {
    it("should be loaded with correct type", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "monitor1",
          type: "seqera-workflow-monitor",
          name: "Test Monitor",
          seqera: "config-node-1",
          workflowId: "workflowId",
          workflowIdType: "msg",
          poll: 5,
          pollType: "num",
          keepPolling: true,
          wires: [[], [], []],
        },
      ];

      helper.load([configNode, workflowMonitorNode], flow, createCredentials(), function () {
        const n1 = helper.getNode("monitor1");
        try {
          expect(n1).to.exist;
          expect(n1.type).to.equal("seqera-workflow-monitor");
          expect(n1.name).to.equal("Test Monitor");
          done();
        } catch (err) {
          done(err);
        }
      });
    });

    it("should store poll interval configuration", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "monitor1",
          type: "seqera-workflow-monitor",
          name: "Test Monitor",
          seqera: "config-node-1",
          poll: 10,
          pollType: "num",
          keepPolling: true,
          wires: [[], [], []],
        },
      ];

      helper.load([configNode, workflowMonitorNode], flow, createCredentials(), function () {
        const n1 = helper.getNode("monitor1");
        try {
          expect(n1.pollIntervalProp).to.equal(10);
          expect(n1.keepPolling).to.be.true;
          done();
        } catch (err) {
          done(err);
        }
      });
    });

    it("should default keepPolling to true when not specified", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "monitor1",
          type: "seqera-workflow-monitor",
          name: "Test Monitor",
          seqera: "config-node-1",
          wires: [[], [], []],
        },
      ];

      helper.load([configNode, workflowMonitorNode], flow, createCredentials(), function () {
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
    it("should fetch workflow status on input", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "monitor1",
          type: "seqera-workflow-monitor",
          name: "Test Monitor",
          seqera: "config-node-1",
          workflowId: "workflowId",
          workflowIdType: "msg",
          poll: 5,
          pollType: "num",
          keepPolling: false,
          wires: [["helper1"], ["helper2"], ["helper3"]],
        },
        { id: "helper1", type: "helper" },
        { id: "helper2", type: "helper" },
        { id: "helper3", type: "helper" },
      ];

      nock(DEFAULT_BASE_URL)
        .get("/workflow/wf-123")
        .query(true)
        .reply(200, createWorkflowResponse({ id: "wf-123", status: "running" }));

      helper.load([configNode, workflowMonitorNode], flow, createCredentials(), function () {
        const monitorNode = helper.getNode("monitor1");
        const helper1 = helper.getNode("helper1");

        helper1.on("input", function (msg) {
          try {
            expect(msg.workflowId).to.equal("wf-123");
            expect(msg.payload.workflow.status).to.equal("running");
            done();
          } catch (err) {
            done(err);
          }
        });

        monitorNode.receive({ workflowId: "wf-123" });
      });
    });

    it("should report error when workflowId not provided", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "monitor1",
          type: "seqera-workflow-monitor",
          name: "Test Monitor",
          seqera: "config-node-1",
          workflowId: "workflowId",
          workflowIdType: "msg",
          keepPolling: false,
          wires: [[], [], []],
        },
      ];

      helper.load([configNode, workflowMonitorNode], flow, createCredentials(), function () {
        const monitorNode = helper.getNode("monitor1");

        monitorNode.on("call:error", function (call) {
          try {
            expect(call.firstArg).to.include("workflowId not provided");
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
    it("should send to output 1 (active) when status is running", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "monitor1",
          type: "seqera-workflow-monitor",
          name: "Test Monitor",
          seqera: "config-node-1",
          workflowId: "workflowId",
          workflowIdType: "msg",
          keepPolling: false,
          wires: [["helper1"], ["helper2"], ["helper3"]],
        },
        { id: "helper1", type: "helper" },
        { id: "helper2", type: "helper" },
        { id: "helper3", type: "helper" },
      ];

      nock(DEFAULT_BASE_URL)
        .get("/workflow/wf-123")
        .query(true)
        .reply(200, createWorkflowResponse({ status: "running" }));

      helper.load([configNode, workflowMonitorNode], flow, createCredentials(), function () {
        const monitorNode = helper.getNode("monitor1");
        const helper1 = helper.getNode("helper1");
        const helper2 = helper.getNode("helper2");
        const helper3 = helper.getNode("helper3");

        let receivedOnHelper1 = false;

        helper1.on("input", function (msg) {
          receivedOnHelper1 = true;
        });

        helper2.on("input", function () {
          done(new Error("Should not receive on output 2 for running status"));
        });

        helper3.on("input", function () {
          done(new Error("Should not receive on output 3 for running status"));
        });

        monitorNode.receive({ workflowId: "wf-123" });

        setTimeout(function () {
          try {
            expect(receivedOnHelper1).to.be.true;
            done();
          } catch (err) {
            done(err);
          }
        }, 100);
      });
    });

    it("should send to output 1 (active) when status is submitted", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "monitor1",
          type: "seqera-workflow-monitor",
          name: "Test Monitor",
          seqera: "config-node-1",
          workflowId: "workflowId",
          workflowIdType: "msg",
          keepPolling: false,
          wires: [["helper1"], ["helper2"], ["helper3"]],
        },
        { id: "helper1", type: "helper" },
        { id: "helper2", type: "helper" },
        { id: "helper3", type: "helper" },
      ];

      nock(DEFAULT_BASE_URL)
        .get("/workflow/wf-123")
        .query(true)
        .reply(200, createWorkflowResponse({ status: "submitted" }));

      helper.load([configNode, workflowMonitorNode], flow, createCredentials(), function () {
        const monitorNode = helper.getNode("monitor1");
        const helper1 = helper.getNode("helper1");

        helper1.on("input", function (msg) {
          try {
            expect(msg.payload.workflow.status).to.equal("submitted");
            done();
          } catch (err) {
            done(err);
          }
        });

        monitorNode.receive({ workflowId: "wf-123" });
      });
    });

    it("should send to output 2 (succeeded) when status is succeeded", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "monitor1",
          type: "seqera-workflow-monitor",
          name: "Test Monitor",
          seqera: "config-node-1",
          workflowId: "workflowId",
          workflowIdType: "msg",
          keepPolling: false,
          wires: [["helper1"], ["helper2"], ["helper3"]],
        },
        { id: "helper1", type: "helper" },
        { id: "helper2", type: "helper" },
        { id: "helper3", type: "helper" },
      ];

      nock(DEFAULT_BASE_URL)
        .get("/workflow/wf-123")
        .query(true)
        .reply(200, createWorkflowResponse({ status: "succeeded" }));

      helper.load([configNode, workflowMonitorNode], flow, createCredentials(), function () {
        const monitorNode = helper.getNode("monitor1");
        const helper2 = helper.getNode("helper2");

        helper2.on("input", function (msg) {
          try {
            expect(msg.payload.workflow.status).to.equal("succeeded");
            done();
          } catch (err) {
            done(err);
          }
        });

        monitorNode.receive({ workflowId: "wf-123" });
      });
    });

    it("should send to output 3 (failed) when status is failed", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "monitor1",
          type: "seqera-workflow-monitor",
          name: "Test Monitor",
          seqera: "config-node-1",
          workflowId: "workflowId",
          workflowIdType: "msg",
          keepPolling: false,
          wires: [["helper1"], ["helper2"], ["helper3"]],
        },
        { id: "helper1", type: "helper" },
        { id: "helper2", type: "helper" },
        { id: "helper3", type: "helper" },
      ];

      nock(DEFAULT_BASE_URL)
        .get("/workflow/wf-123")
        .query(true)
        .reply(200, createWorkflowResponse({ status: "failed" }));

      helper.load([configNode, workflowMonitorNode], flow, createCredentials(), function () {
        const monitorNode = helper.getNode("monitor1");
        const helper3 = helper.getNode("helper3");

        helper3.on("input", function (msg) {
          try {
            expect(msg.payload.workflow.status).to.equal("failed");
            done();
          } catch (err) {
            done(err);
          }
        });

        monitorNode.receive({ workflowId: "wf-123" });
      });
    });

    it("should send to output 3 when status is cancelled", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "monitor1",
          type: "seqera-workflow-monitor",
          name: "Test Monitor",
          seqera: "config-node-1",
          workflowId: "workflowId",
          workflowIdType: "msg",
          keepPolling: false,
          wires: [["helper1"], ["helper2"], ["helper3"]],
        },
        { id: "helper1", type: "helper" },
        { id: "helper2", type: "helper" },
        { id: "helper3", type: "helper" },
      ];

      nock(DEFAULT_BASE_URL)
        .get("/workflow/wf-123")
        .query(true)
        .reply(200, createWorkflowResponse({ status: "cancelled" }));

      helper.load([configNode, workflowMonitorNode], flow, createCredentials(), function () {
        const monitorNode = helper.getNode("monitor1");
        const helper3 = helper.getNode("helper3");

        helper3.on("input", function (msg) {
          try {
            expect(msg.payload.workflow.status).to.equal("cancelled");
            done();
          } catch (err) {
            done(err);
          }
        });

        monitorNode.receive({ workflowId: "wf-123" });
      });
    });
  });

  describe("polling behavior", function () {
    it("should stop polling when workflow reaches terminal state", function (done) {
      this.timeout(5000);

      const flow = [
        createConfigNode(),
        {
          id: "monitor1",
          type: "seqera-workflow-monitor",
          name: "Test Monitor",
          seqera: "config-node-1",
          workflowId: "workflowId",
          workflowIdType: "msg",
          poll: 1,
          pollType: "num",
          keepPolling: true,
          wires: [["helper1"], ["helper2"], ["helper3"]],
        },
        { id: "helper1", type: "helper" },
        { id: "helper2", type: "helper" },
        { id: "helper3", type: "helper" },
      ];

      let pollCount = 0;

      // First call: running, second call: succeeded
      nock(DEFAULT_BASE_URL)
        .get("/workflow/wf-123")
        .query(true)
        .reply(200, function () {
          pollCount++;
          if (pollCount === 1) {
            return createWorkflowResponse({ status: "running" });
          }
          return createWorkflowResponse({ status: "succeeded" });
        })
        .persist();

      helper.load([configNode, workflowMonitorNode], flow, createCredentials(), function () {
        const monitorNode = helper.getNode("monitor1");
        const helper2 = helper.getNode("helper2");

        helper2.on("input", function (msg) {
          // Once we receive on helper2 (succeeded), polling should stop
          setTimeout(function () {
            try {
              // pollCount should be 2 (running, then succeeded)
              // It shouldn't continue polling after succeeded
              expect(pollCount).to.equal(2);
              done();
            } catch (err) {
              done(err);
            }
          }, 2000); // Wait to ensure no more polls happen
        });

        monitorNode.receive({ workflowId: "wf-123" });
      });
    });

    it("should stop polling when keepPolling is false", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "monitor1",
          type: "seqera-workflow-monitor",
          name: "Test Monitor",
          seqera: "config-node-1",
          workflowId: "workflowId",
          workflowIdType: "msg",
          poll: 1,
          pollType: "num",
          keepPolling: false,
          wires: [["helper1"], [], []],
        },
        { id: "helper1", type: "helper" },
      ];

      let pollCount = 0;

      nock(DEFAULT_BASE_URL)
        .get("/workflow/wf-123")
        .query(true)
        .reply(200, function () {
          pollCount++;
          return createWorkflowResponse({ status: "running" });
        })
        .persist();

      helper.load([configNode, workflowMonitorNode], flow, createCredentials(), function () {
        const monitorNode = helper.getNode("monitor1");
        const helper1 = helper.getNode("helper1");

        helper1.on("input", function (msg) {
          // Should only poll once since keepPolling is false
          setTimeout(function () {
            try {
              expect(pollCount).to.equal(1);
              done();
            } catch (err) {
              done(err);
            }
          }, 1500);
        });

        monitorNode.receive({ workflowId: "wf-123" });
      });
    });
  });

  describe("concurrent workflows", function () {
    it("should monitor multiple workflows independently", function (done) {
      this.timeout(5000);

      const flow = [
        createConfigNode(),
        {
          id: "monitor1",
          type: "seqera-workflow-monitor",
          name: "Test Monitor",
          seqera: "config-node-1",
          workflowId: "workflowId",
          workflowIdType: "msg",
          poll: 1,
          pollType: "num",
          keepPolling: true,
          wires: [["helper1"], ["helper2"], ["helper3"]],
        },
        { id: "helper1", type: "helper" },
        { id: "helper2", type: "helper" },
        { id: "helper3", type: "helper" },
      ];

      const wf1Polls = [];
      const wf2Polls = [];

      // Workflow 1: running -> succeeded
      nock(DEFAULT_BASE_URL)
        .get("/workflow/wf-123")
        .query(true)
        .reply(200, function () {
          wf1Polls.push(Date.now());
          if (wf1Polls.length === 1) {
            return createWorkflowResponse({ id: "wf-123", status: "running" });
          }
          return createWorkflowResponse({ id: "wf-123", status: "succeeded" });
        })
        .persist();

      // Workflow 2: running -> running -> succeeded
      nock(DEFAULT_BASE_URL)
        .get("/workflow/wf-456")
        .query(true)
        .reply(200, function () {
          wf2Polls.push(Date.now());
          if (wf2Polls.length < 3) {
            return createWorkflowResponse({ id: "wf-456", status: "running" });
          }
          return createWorkflowResponse({ id: "wf-456", status: "succeeded" });
        })
        .persist();

      helper.load([configNode, workflowMonitorNode], flow, createCredentials(), function () {
        const monitorNode = helper.getNode("monitor1");
        const helper2 = helper.getNode("helper2");

        let wf1Completed = false;
        let wf2Completed = false;

        helper2.on("input", function (msg) {
          if (msg.workflowId === "wf-123") {
            wf1Completed = true;
          } else if (msg.workflowId === "wf-456") {
            wf2Completed = true;
          }

          // Check if both workflows completed
          if (wf1Completed && wf2Completed) {
            setTimeout(function () {
              try {
                // Verify wf-123 was polled twice (running, succeeded)
                expect(wf1Polls.length).to.equal(2);
                // Verify wf-456 was polled at least 3 times (running, running, succeeded)
                expect(wf2Polls.length).to.be.at.least(3);
                // Verify both workflows completed
                expect(wf1Completed).to.be.true;
                expect(wf2Completed).to.be.true;
                done();
              } catch (err) {
                done(err);
              }
            }, 500);
          }
        });

        // Send two workflows in quick succession
        monitorNode.receive({ workflowId: "wf-123" });
        setTimeout(() => {
          monitorNode.receive({ workflowId: "wf-456" });
        }, 50);
      });
    });

    it("should preserve message context for each workflow independently", function (done) {
      this.timeout(5000);

      const flow = [
        createConfigNode(),
        {
          id: "monitor1",
          type: "seqera-workflow-monitor",
          name: "Test Monitor",
          seqera: "config-node-1",
          workflowId: "workflowId",
          workflowIdType: "msg",
          poll: 1,
          pollType: "num",
          keepPolling: true,
          wires: [[], ["helper2"], []],
        },
        { id: "helper2", type: "helper" },
      ];

      nock(DEFAULT_BASE_URL)
        .get("/workflow/wf-123")
        .query(true)
        .reply(200, createWorkflowResponse({ id: "wf-123", status: "succeeded" }));

      nock(DEFAULT_BASE_URL)
        .get("/workflow/wf-456")
        .query(true)
        .reply(200, createWorkflowResponse({ id: "wf-456", status: "succeeded" }));

      helper.load([configNode, workflowMonitorNode], flow, createCredentials(), function () {
        const monitorNode = helper.getNode("monitor1");
        const helper2 = helper.getNode("helper2");

        const receivedMessages = [];

        helper2.on("input", function (msg) {
          receivedMessages.push({
            workflowId: msg.workflowId,
            correlationId: msg.correlationId,
            customProp: msg.customProp,
          });

          // Check if we received both workflows
          if (receivedMessages.length === 2) {
            try {
              // Verify wf-123 kept its context
              const wf1Msg = receivedMessages.find((m) => m.workflowId === "wf-123");
              expect(wf1Msg).to.exist;
              expect(wf1Msg.correlationId).to.equal("corr-123");
              expect(wf1Msg.customProp).to.equal("context-1");

              // Verify wf-456 kept its context
              const wf2Msg = receivedMessages.find((m) => m.workflowId === "wf-456");
              expect(wf2Msg).to.exist;
              expect(wf2Msg.correlationId).to.equal("corr-456");
              expect(wf2Msg.customProp).to.equal("context-2");

              done();
            } catch (err) {
              done(err);
            }
          }
        });

        // Send two workflows with different contexts
        monitorNode.receive({
          workflowId: "wf-123",
          correlationId: "corr-123",
          customProp: "context-1",
        });

        setTimeout(() => {
          monitorNode.receive({
            workflowId: "wf-456",
            correlationId: "corr-456",
            customProp: "context-2",
          });
        }, 50);
      });
    });

    it("should handle same workflowId triggered twice by replacing the old monitor", function (done) {
      this.timeout(5000);

      const flow = [
        createConfigNode(),
        {
          id: "monitor1",
          type: "seqera-workflow-monitor",
          name: "Test Monitor",
          seqera: "config-node-1",
          workflowId: "workflowId",
          workflowIdType: "msg",
          poll: 1,
          pollType: "num",
          keepPolling: true,
          wires: [[], ["helper2"], []],
        },
        { id: "helper2", type: "helper" },
      ];

      let pollCount = 0;

      nock(DEFAULT_BASE_URL)
        .get("/workflow/wf-123")
        .query(true)
        .reply(200, function () {
          pollCount++;
          if (pollCount < 3) {
            return createWorkflowResponse({ id: "wf-123", status: "running" });
          }
          return createWorkflowResponse({ id: "wf-123", status: "succeeded" });
        })
        .persist();

      helper.load([configNode, workflowMonitorNode], flow, createCredentials(), function () {
        const monitorNode = helper.getNode("monitor1");
        const helper2 = helper.getNode("helper2");

        const receivedMessages = [];

        helper2.on("input", function (msg) {
          receivedMessages.push({
            correlationId: msg.correlationId,
          });

          // When we get succeeded state
          setTimeout(function () {
            try {
              // Should only receive the second context (first was replaced)
              expect(receivedMessages.length).to.equal(1);
              expect(receivedMessages[0].correlationId).to.equal("corr-second");
              done();
            } catch (err) {
              done(err);
            }
          }, 500);
        });

        // Send same workflow twice with different contexts
        monitorNode.receive({
          workflowId: "wf-123",
          correlationId: "corr-first",
        });

        // Immediately send again - should replace the first one
        setTimeout(() => {
          monitorNode.receive({
            workflowId: "wf-123",
            correlationId: "corr-second",
          });
        }, 100);
      });
    });
  });

  describe("message passthrough", function () {
    it("should preserve custom message properties", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "monitor1",
          type: "seqera-workflow-monitor",
          name: "Test Monitor",
          seqera: "config-node-1",
          workflowId: "workflowId",
          workflowIdType: "msg",
          keepPolling: false,
          wires: [["helper1"], [], []],
        },
        { id: "helper1", type: "helper" },
      ];

      nock(DEFAULT_BASE_URL)
        .get("/workflow/wf-123")
        .query(true)
        .reply(200, createWorkflowResponse({ status: "running" }));

      helper.load([configNode, workflowMonitorNode], flow, createCredentials(), function () {
        const monitorNode = helper.getNode("monitor1");
        const helper1 = helper.getNode("helper1");

        helper1.on("input", function (msg) {
          try {
            expect(msg._context).to.equal("test-context");
            expect(msg.correlationId).to.equal("corr-456");
            expect(msg.workflowId).to.exist;
            done();
          } catch (err) {
            done(err);
          }
        });

        monitorNode.receive({
          workflowId: "wf-123",
          _context: "test-context",
          correlationId: "corr-456",
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
          type: "seqera-workflow-monitor",
          name: "Test Monitor",
          seqera: "config-node-1",
          workflowId: "workflowId",
          workflowIdType: "msg",
          keepPolling: true,
          wires: [[], [], []],
        },
      ];

      nock(DEFAULT_BASE_URL).get("/workflow/wf-123").query(true).reply(500, { error: "Server error" });

      helper.load([configNode, workflowMonitorNode], flow, createCredentials(), function () {
        const monitorNode = helper.getNode("monitor1");

        monitorNode.on("call:error", function (call) {
          try {
            expect(call.firstArg).to.include("Workflow wf-123:");
            expect(call.firstArg).to.include("Request failed");
            done();
          } catch (err) {
            done(err);
          }
        });

        monitorNode.receive({ workflowId: "wf-123" });
      });
    });
  });

  describe("cleanup on close", function () {
    it("should clear interval when node is closed", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "monitor1",
          type: "seqera-workflow-monitor",
          name: "Test Monitor",
          seqera: "config-node-1",
          workflowId: "workflowId",
          workflowIdType: "msg",
          poll: 1,
          pollType: "num",
          keepPolling: true,
          wires: [["helper1"], [], []],
        },
        { id: "helper1", type: "helper" },
      ];

      let pollCount = 0;

      nock(DEFAULT_BASE_URL)
        .get("/workflow/wf-123")
        .query(true)
        .reply(200, function () {
          pollCount++;
          return createWorkflowResponse({ status: "running" });
        })
        .persist();

      helper.load([configNode, workflowMonitorNode], flow, createCredentials(), function () {
        const monitorNode = helper.getNode("monitor1");
        const helper1 = helper.getNode("helper1");

        helper1.on("input", function (msg) {
          // After first message, close the node
          monitorNode.close();

          // Wait and verify no more polls happened
          setTimeout(function () {
            try {
              expect(pollCount).to.equal(1);
              done();
            } catch (err) {
              done(err);
            }
          }, 2000);
        });

        monitorNode.receive({ workflowId: "wf-123" });
      });
    });
  });
});
