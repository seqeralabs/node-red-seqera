/**
 * Tests for nodes/workflow-poll.js (seqera-workflow-poll node)
 *
 * Tests the workflow polling functionality including:
 * - Automatic polling at configurable intervals
 * - Two outputs: All workflows, New workflows (detected since last poll)
 * - Search and filter capabilities
 * - Poll frequency unit conversion (seconds, minutes, hours, days)
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

const workflowPollNode = require("../nodes/workflow-poll");
const configNode = require("../nodes/config");

describe("seqera-workflow-poll Node", function () {
  beforeEach(function (done) {
    helper.startServer(done);
  });

  afterEach(function (done) {
    helper.unload();
    helper.stopServer(done);
    nock.cleanAll();
  });

  // Helper to create workflows list response
  function createWorkflowsListResponse(workflows = []) {
    const defaultWorkflows = [
      {
        workflow: {
          id: "workflow-123",
          status: "running",
          runName: "test-run-1",
          projectName: "test-project",
        },
      },
      {
        workflow: {
          id: "workflow-456",
          status: "succeeded",
          runName: "test-run-2",
          projectName: "test-project",
        },
      },
    ];

    return {
      workflows: workflows.length > 0 ? workflows : defaultWorkflows,
    };
  }

  describe("node loading", function () {
    it("should be loaded with correct type", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "poll1",
          type: "seqera-workflow-poll",
          name: "Test Workflow Poll",
          seqera: "config-node-1",
          search: "",
          searchType: "str",
          maxResults: "50",
          maxResultsType: "num",
          pollFrequency: "1",
          pollUnits: "minutes",
          wires: [[], []],
        },
      ];

      // Mock the API call that happens on startup
      nock(DEFAULT_BASE_URL).get("/workflow").query(true).reply(200, createWorkflowsListResponse()).persist();

      helper.load([configNode, workflowPollNode], flow, createCredentials(), function () {
        const n1 = helper.getNode("poll1");
        try {
          expect(n1).to.exist;
          expect(n1.type).to.equal("seqera-workflow-poll");
          expect(n1.name).to.equal("Test Workflow Poll");
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
          type: "seqera-workflow-poll",
          name: "Test Workflow Poll",
          seqera: "config-node-1",
          pollFrequency: "5",
          pollUnits: "minutes",
          wires: [[], []],
        },
      ];

      nock(DEFAULT_BASE_URL).get("/workflow").query(true).reply(200, createWorkflowsListResponse()).persist();

      helper.load([configNode, workflowPollNode], flow, createCredentials(), function () {
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

    it("should calculate poll frequency correctly for different units", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "poll1",
          type: "seqera-workflow-poll",
          name: "Test Hours",
          seqera: "config-node-1",
          pollFrequency: "2",
          pollUnits: "hours",
          wires: [[], []],
        },
      ];

      nock(DEFAULT_BASE_URL).get("/workflow").query(true).reply(200, createWorkflowsListResponse()).persist();

      helper.load([configNode, workflowPollNode], flow, createCredentials(), function () {
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
          type: "seqera-workflow-poll",
          name: "Test Days",
          seqera: "config-node-1",
          pollFrequency: "1",
          pollUnits: "days",
          wires: [[], []],
        },
      ];

      nock(DEFAULT_BASE_URL).get("/workflow").query(true).reply(200, createWorkflowsListResponse()).persist();

      helper.load([configNode, workflowPollNode], flow, createCredentials(), function () {
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
  });

  describe("polling behavior", function () {
    it("should poll immediately on startup and send to output 1", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "poll1",
          type: "seqera-workflow-poll",
          name: "Test Workflow Poll",
          seqera: "config-node-1",
          pollFrequency: "60",
          pollUnits: "seconds",
          wires: [["helper1"], ["helper2"]],
        },
        { id: "helper1", type: "helper" },
        { id: "helper2", type: "helper" },
      ];

      nock(DEFAULT_BASE_URL).get("/workflow").query(true).reply(200, createWorkflowsListResponse());

      helper.load([configNode, workflowPollNode], flow, createCredentials(), function () {
        const pollNode = helper.getNode("poll1");
        const helper1 = helper.getNode("helper1");

        helper1.on("input", function (msg) {
          try {
            expect(msg.payload.workflows).to.be.an("array");
            expect(msg.payload.workflows.length).to.equal(2);
            expect(msg.workflowIds).to.deep.equal(["workflow-123", "workflow-456"]);
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

    it("should include search parameter in API call when provided", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "poll1",
          type: "seqera-workflow-poll",
          name: "Test Workflow Poll",
          seqera: "config-node-1",
          search: "my-pipeline",
          searchType: "str",
          pollFrequency: "60",
          pollUnits: "seconds",
          wires: [["helper1"], []],
        },
        { id: "helper1", type: "helper" },
      ];

      // Verify the search parameter is included
      nock(DEFAULT_BASE_URL)
        .get("/workflow")
        .query((query) => {
          return query.search === "my-pipeline";
        })
        .reply(200, createWorkflowsListResponse());

      helper.load([configNode, workflowPollNode], flow, createCredentials(), function () {
        const pollNode = helper.getNode("poll1");
        const helper1 = helper.getNode("helper1");

        helper1.on("input", function (msg) {
          try {
            expect(msg.payload.workflows).to.be.an("array");
            pollNode.close();
            done();
          } catch (err) {
            pollNode.close();
            done(err);
          }
        });
      });
    });

    it("should respect maxResults parameter", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "poll1",
          type: "seqera-workflow-poll",
          name: "Test Workflow Poll",
          seqera: "config-node-1",
          maxResults: "10",
          maxResultsType: "num",
          pollFrequency: "60",
          pollUnits: "seconds",
          wires: [["helper1"], []],
        },
        { id: "helper1", type: "helper" },
      ];

      // Verify maxResults is passed
      nock(DEFAULT_BASE_URL)
        .get("/workflow")
        .query((query) => {
          return query.max === "10";
        })
        .reply(200, createWorkflowsListResponse());

      helper.load([configNode, workflowPollNode], flow, createCredentials(), function () {
        const pollNode = helper.getNode("poll1");
        const helper1 = helper.getNode("helper1");

        helper1.on("input", function (msg) {
          try {
            expect(msg.payload.workflows).to.be.an("array");
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

  describe("new workflow detection", function () {
    it("should detect new workflows on subsequent polls", function (done) {
      this.timeout(5000);

      const flow = [
        createConfigNode(),
        {
          id: "poll1",
          type: "seqera-workflow-poll",
          name: "Test Workflow Poll",
          seqera: "config-node-1",
          pollFrequency: "1",
          pollUnits: "seconds",
          wires: [["helper1"], ["helper2"]],
        },
        { id: "helper1", type: "helper" },
        { id: "helper2", type: "helper" },
      ];

      let pollCount = 0;

      // First poll: return 2 workflows
      // Second poll: return 3 workflows (1 new one)
      nock(DEFAULT_BASE_URL)
        .get("/workflow")
        .query(true)
        .reply(200, function () {
          pollCount++;
          if (pollCount === 1) {
            return createWorkflowsListResponse([
              { workflow: { id: "workflow-123", status: "running", runName: "test-1" } },
              { workflow: { id: "workflow-456", status: "running", runName: "test-2" } },
            ]);
          }
          return createWorkflowsListResponse([
            { workflow: { id: "workflow-123", status: "running", runName: "test-1" } },
            { workflow: { id: "workflow-456", status: "running", runName: "test-2" } },
            { workflow: { id: "workflow-789", status: "submitted", runName: "test-3" } },
          ]);
        })
        .persist();

      helper.load([configNode, workflowPollNode], flow, createCredentials(), function () {
        const pollNode = helper.getNode("poll1");
        const helper2 = helper.getNode("helper2");

        helper2.on("input", function (msg) {
          try {
            // Output 2 should only contain the new workflow
            expect(msg.payload.workflow.workflow.id).to.equal("workflow-789");
            expect(msg.workflowId).to.equal("workflow-789");
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
          type: "seqera-workflow-poll",
          name: "Test Workflow Poll",
          seqera: "config-node-1",
          pollFrequency: "60",
          pollUnits: "seconds",
          wires: [["helper1"], ["helper2"]],
        },
        { id: "helper1", type: "helper" },
        { id: "helper2", type: "helper" },
      ];

      nock(DEFAULT_BASE_URL).get("/workflow").query(true).reply(200, createWorkflowsListResponse());

      helper.load([configNode, workflowPollNode], flow, createCredentials(), function () {
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

    it("should send individual messages for each new workflow", function (done) {
      this.timeout(5000);

      const flow = [
        createConfigNode(),
        {
          id: "poll1",
          type: "seqera-workflow-poll",
          name: "Test Workflow Poll",
          seqera: "config-node-1",
          pollFrequency: "1",
          pollUnits: "seconds",
          wires: [["helper1"], ["helper2"]],
        },
        { id: "helper1", type: "helper" },
        { id: "helper2", type: "helper" },
      ];

      let pollCount = 0;

      nock(DEFAULT_BASE_URL)
        .get("/workflow")
        .query(true)
        .reply(200, function () {
          pollCount++;
          if (pollCount === 1) {
            return createWorkflowsListResponse([
              { workflow: { id: "workflow-123", status: "running", runName: "test-1" } },
            ]);
          }
          // Add 2 new workflows
          return createWorkflowsListResponse([
            { workflow: { id: "workflow-123", status: "running", runName: "test-1" } },
            { workflow: { id: "workflow-new-1", status: "submitted", runName: "new-1" } },
            { workflow: { id: "workflow-new-2", status: "submitted", runName: "new-2" } },
          ]);
        })
        .persist();

      helper.load([configNode, workflowPollNode], flow, createCredentials(), function () {
        const pollNode = helper.getNode("poll1");
        const helper2 = helper.getNode("helper2");

        const newWorkflowIds = [];

        helper2.on("input", function (msg) {
          newWorkflowIds.push(msg.workflowId);

          if (newWorkflowIds.length === 2) {
            try {
              expect(newWorkflowIds).to.include("workflow-new-1");
              expect(newWorkflowIds).to.include("workflow-new-2");
              pollNode.close();
              done();
            } catch (err) {
              pollNode.close();
              done(err);
            }
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
          type: "seqera-workflow-poll",
          name: "Test Workflow Poll",
          seqera: "config-node-1",
          pollFrequency: "60",
          pollUnits: "seconds",
          wires: [[], []],
        },
      ];

      nock(DEFAULT_BASE_URL).get("/workflow").query(true).reply(500, { error: "Server error" });

      helper.load([configNode, workflowPollNode], flow, createCredentials(), function () {
        const pollNode = helper.getNode("poll1");

        pollNode.on("call:error", function (call) {
          try {
            expect(call.firstArg).to.include("Seqera workflow poll failed");
            pollNode.close();
            done();
          } catch (err) {
            pollNode.close();
            done(err);
          }
        });
      });
    });

    it("should report error when workspace ID is not provided", function (done) {
      const flow = [
        {
          id: "config-node-1",
          type: "seqera-config",
          name: "Test Config",
          baseUrl: DEFAULT_BASE_URL,
          workspaceId: "", // No workspace ID
        },
        {
          id: "poll1",
          type: "seqera-workflow-poll",
          name: "Test Workflow Poll",
          seqera: "config-node-1",
          pollFrequency: "60",
          pollUnits: "seconds",
          wires: [[], []],
        },
      ];

      helper.load([configNode, workflowPollNode], flow, createCredentials(), function () {
        const pollNode = helper.getNode("poll1");

        pollNode.on("call:error", function (call) {
          try {
            expect(call.firstArg).to.include("Workspace ID not provided");
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
          type: "seqera-workflow-poll",
          name: "Test Workflow Poll",
          seqera: "config-node-1",
          pollFrequency: "1",
          pollUnits: "seconds",
          wires: [["helper1"], []],
        },
        { id: "helper1", type: "helper" },
      ];

      let pollCount = 0;

      nock(DEFAULT_BASE_URL)
        .get("/workflow")
        .query(true)
        .reply(200, function () {
          pollCount++;
          return createWorkflowsListResponse();
        })
        .persist();

      helper.load([configNode, workflowPollNode], flow, createCredentials(), function () {
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

  describe("workspace ID override", function () {
    it("should use workspace ID from config when not overridden", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "poll1",
          type: "seqera-workflow-poll",
          name: "Test Workflow Poll",
          seqera: "config-node-1",
          workspaceId: "",
          workspaceIdType: "str",
          pollFrequency: "60",
          pollUnits: "seconds",
          wires: [["helper1"], []],
        },
        { id: "helper1", type: "helper" },
      ];

      nock(DEFAULT_BASE_URL)
        .get("/workflow")
        .query((query) => {
          return query.workspaceId === DEFAULT_WORKSPACE_ID;
        })
        .reply(200, createWorkflowsListResponse());

      helper.load([configNode, workflowPollNode], flow, createCredentials(), function () {
        const pollNode = helper.getNode("poll1");
        const helper1 = helper.getNode("helper1");

        helper1.on("input", function (msg) {
          try {
            expect(msg.payload.workflows).to.exist;
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
});
