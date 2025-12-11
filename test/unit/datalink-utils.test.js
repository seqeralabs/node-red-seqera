/**
 * Tests for nodes/datalink-utils.js
 */
const nock = require("nock");
const { resolveDataLink, listDataLink } = require("../../nodes/datalink-utils");
const { createMockRED } = require("../helpers/mock-red");
const { createMockNode, createMockSeqeraConfigNode } = require("../helpers/mock-node");
const { mockSeqeraAPI, BASE_URL } = require("../helpers/mock-axios");
const { createMockMsg } = require("../helpers/test-utils");

describe("datalink-utils.js", () => {
  describe("resolveDataLink", () => {
    let RED;
    let node;
    let api;

    beforeEach(() => {
      RED = createMockRED();
      node = createMockNode({
        seqeraConfig: createMockSeqeraConfigNode(),
      });
      api = mockSeqeraAPI();
    });

    it("should resolve data link by name and return IDs", async () => {
      api.mockDataLinksSearch([
        {
          id: "dl-123",
          name: "my-data-link",
          credentials: [{ id: "cred-456" }],
          resourceRef: "s3://my-bucket",
          type: "bucket",
          provider: "aws",
        },
      ]);

      const result = await resolveDataLink(RED, node, {}, "my-data-link", {
        baseUrl: BASE_URL,
        workspaceId: "ws-123",
      });

      expect(result).toEqual({
        dataLinkId: "dl-123",
        credentialsId: "cred-456",
        resourceRef: "s3://my-bucket",
        resourceType: "bucket",
        provider: "aws",
      });
    });

    it("should throw error if dataLinkName not provided", async () => {
      await expect(
        resolveDataLink(RED, node, {}, null, {
          baseUrl: BASE_URL,
          workspaceId: "ws-123",
        }),
      ).rejects.toThrow("dataLinkName not provided");
    });

    it("should throw error if data link not found", async () => {
      api.mockDataLinksSearch([]);

      await expect(
        resolveDataLink(RED, node, {}, "non-existent", {
          baseUrl: BASE_URL,
          workspaceId: "ws-123",
        }),
      ).rejects.toThrow("Could not find Data Link 'non-existent'");
    });

    it("should throw error if multiple data links match", async () => {
      api.mockDataLinksSearch([
        { id: "dl-1", name: "ambiguous" },
        { id: "dl-2", name: "ambiguous-link" },
      ]);

      await expect(
        resolveDataLink(RED, node, {}, "ambiguous", {
          baseUrl: BASE_URL,
          workspaceId: "ws-123",
        }),
      ).rejects.toThrow("Found more than one Data Link matching 'ambiguous'");
    });

    it("should include workspaceId in search query", async () => {
      const scope = nock(BASE_URL)
        .get("/data-links/")
        .query((q) => q.workspaceId === "specific-ws" && q.search === "test-link")
        .reply(200, {
          dataLinks: [{ id: "dl-1", name: "test-link" }],
        });

      await resolveDataLink(RED, node, {}, "test-link", {
        baseUrl: BASE_URL,
        workspaceId: "specific-ws",
      });

      expect(scope.isDone()).toBe(true);
    });

    it("should handle data link without credentials", async () => {
      api.mockDataLinksSearch([
        {
          id: "dl-123",
          name: "public-link",
          credentials: [],
          resourceRef: "gs://public-bucket",
          type: "bucket",
          provider: "gcp",
        },
      ]);

      const result = await resolveDataLink(RED, node, {}, "public-link", {
        baseUrl: BASE_URL,
      });

      expect(result.credentialsId).toBeUndefined();
    });

    it("should strip trailing slash from baseUrl", async () => {
      const scope = nock(BASE_URL)
        .get("/data-links/")
        .query(true)
        .reply(200, { dataLinks: [{ id: "dl-1", name: "test" }] });

      await resolveDataLink(RED, node, {}, "test", {
        baseUrl: `${BASE_URL}/`,
        workspaceId: "ws-123",
      });

      expect(scope.isDone()).toBe(true);
    });
  });

  describe("listDataLink", () => {
    let RED;
    let node;
    let api;

    beforeEach(() => {
      RED = createMockRED();
      api = mockSeqeraAPI();
    });

    function createDataLinkNode(overrides = {}) {
      const seqeraConfig = createMockSeqeraConfigNode();
      return createMockNode({
        seqeraConfig,
        defaultBaseUrl: BASE_URL,
        // Required property configs
        dataLinkNameProp: "test-data-link",
        dataLinkNamePropType: "str",
        basePathProp: "",
        basePathPropType: "str",
        prefixProp: "",
        prefixPropType: "str",
        patternProp: "",
        patternPropType: "str",
        maxResultsProp: "100",
        maxResultsPropType: "num",
        workspaceIdProp: "",
        workspaceIdPropType: "str",
        baseUrlProp: "",
        baseUrlPropType: "str",
        depthProp: "0",
        depthPropType: "num",
        returnType: "all",
        ...overrides,
      });
    }

    it("should list files from data link", async () => {
      node = createDataLinkNode();

      // Mock resolve data link
      api.mockDataLinksSearch([
        {
          id: "dl-123",
          name: "test-data-link",
          credentials: [{ id: "cred-1" }],
          resourceRef: "s3://bucket",
          type: "bucket",
          provider: "aws",
        },
      ]);

      // Mock browse
      api.mockDataLinkBrowse("dl-123", [
        { name: "file1.txt", type: "FILE", size: 100 },
        { name: "file2.csv", type: "FILE", size: 200 },
      ]);

      const result = await listDataLink(RED, node, {});

      expect(result.items).toHaveLength(2);
      expect(result.files).toEqual(["file1.txt", "file2.csv"]);
      expect(result.resourceRef).toBe("s3://bucket");
      expect(result.provider).toBe("aws");
    });

    it("should throw error if dataLinkName not provided", async () => {
      node = createDataLinkNode({ dataLinkNameProp: "" });

      await expect(listDataLink(RED, node, {})).rejects.toThrow("dataLinkName not provided");
    });

    it("should respect maxResults limit", async () => {
      node = createDataLinkNode({ maxResultsProp: "2", maxResultsPropType: "num" });

      api.mockDataLinksSearch([{ id: "dl-123", name: "test-data-link" }]);
      api.mockDataLinkBrowse("dl-123", [
        { name: "file1.txt", type: "FILE" },
        { name: "file2.txt", type: "FILE" },
        { name: "file3.txt", type: "FILE" },
        { name: "file4.txt", type: "FILE" },
      ]);

      const result = await listDataLink(RED, node, {});

      expect(result.items).toHaveLength(2);
    });

    it("should filter by regex pattern", async () => {
      node = createDataLinkNode({ patternProp: "\\.csv$", patternPropType: "str" });

      api.mockDataLinksSearch([{ id: "dl-123", name: "test-data-link" }]);
      api.mockDataLinkBrowse("dl-123", [
        { name: "data.csv", type: "FILE" },
        { name: "data.txt", type: "FILE" },
        { name: "report.csv", type: "FILE" },
      ]);

      const result = await listDataLink(RED, node, {});

      expect(result.files).toEqual(["data.csv", "report.csv"]);
    });

    it("should filter files only when returnType is 'files'", async () => {
      node = createDataLinkNode({ returnType: "files" });

      api.mockDataLinksSearch([{ id: "dl-123", name: "test-data-link" }]);
      api.mockDataLinkBrowse("dl-123", [
        { name: "file.txt", type: "FILE" },
        { name: "folder", type: "FOLDER" },
        { name: "another.csv", type: "FILE" },
      ]);

      const result = await listDataLink(RED, node, {});

      expect(result.items).toHaveLength(2);
      expect(result.files).toEqual(["file.txt", "another.csv"]);
    });

    it("should filter folders only when returnType is 'folders'", async () => {
      node = createDataLinkNode({ returnType: "folders" });

      api.mockDataLinksSearch([{ id: "dl-123", name: "test-data-link" }]);
      api.mockDataLinkBrowse("dl-123", [
        { name: "file.txt", type: "FILE" },
        { name: "folder1", type: "FOLDER" },
        { name: "folder2", type: "FOLDER" },
      ]);

      const result = await listDataLink(RED, node, {});

      expect(result.items).toHaveLength(2);
      expect(result.files).toEqual(["folder1", "folder2"]);
    });

    it("should handle pagination with nextPageToken", async () => {
      node = createDataLinkNode({ maxResultsProp: "100" });

      api.mockDataLinksSearch([{ id: "dl-123", name: "test-data-link" }]);

      // First page
      nock(BASE_URL)
        .get(new RegExp("/data-links/dl-123/browse.*"))
        .query(true)
        .reply(200, {
          objects: [{ name: "file1.txt", type: "FILE" }],
          nextPageToken: "page2-token",
        });

      // Second page
      nock(BASE_URL)
        .get(new RegExp("/data-links/dl-123/browse.*"))
        .query((q) => q.nextPageToken === "page2-token")
        .reply(200, {
          objects: [{ name: "file2.txt", type: "FILE" }],
          nextPageToken: null,
        });

      const result = await listDataLink(RED, node, {});

      expect(result.files).toEqual(["file1.txt", "file2.txt"]);
    });

    it("should recurse into folders when depth > 0", async () => {
      node = createDataLinkNode({ depthProp: "1", depthPropType: "num" });

      api.mockDataLinksSearch([{ id: "dl-123", name: "test-data-link" }]);

      // Root level
      nock(BASE_URL)
        .get(/\/data-links\/dl-123\/browse\/?$/)
        .query(true)
        .reply(200, {
          objects: [
            { name: "root-file.txt", type: "FILE" },
            { name: "subfolder", type: "FOLDER" },
          ],
        });

      // Subfolder level
      nock(BASE_URL)
        .get(/\/data-links\/dl-123\/browse\/subfolder/)
        .query(true)
        .reply(200, {
          objects: [{ name: "nested-file.txt", type: "FILE" }],
        });

      const result = await listDataLink(RED, node, {});

      expect(result.files).toContain("root-file.txt");
      expect(result.files).toContain("subfolder");
      expect(result.files).toContain("subfolder/nested-file.txt");
    });

    it("should not recurse when depth is 0", async () => {
      node = createDataLinkNode({ depthProp: "0", depthPropType: "num" });

      api.mockDataLinksSearch([{ id: "dl-123", name: "test-data-link" }]);

      // Only root should be called
      nock(BASE_URL)
        .get(/\/data-links\/dl-123\/browse\/?$/)
        .query(true)
        .reply(200, {
          objects: [
            { name: "file.txt", type: "FILE" },
            { name: "folder", type: "FOLDER" },
          ],
        });

      const result = await listDataLink(RED, node, {});

      // Should have both but not recurse into folder
      expect(result.files).toEqual(["file.txt", "folder"]);
    });

    it("should use basePath for starting directory", async () => {
      node = createDataLinkNode({ basePathProp: "some/path", basePathPropType: "str" });

      api.mockDataLinksSearch([{ id: "dl-123", name: "test-data-link" }]);

      const scope = nock(BASE_URL)
        .get(/\/data-links\/dl-123\/browse\/some\/path/)
        .query(true)
        .reply(200, { objects: [{ name: "file.txt", type: "FILE" }] });

      await listDataLink(RED, node, {});

      expect(scope.isDone()).toBe(true);
    });

    it("should include prefix in API search parameter", async () => {
      node = createDataLinkNode({ prefixProp: "data_", prefixPropType: "str" });

      api.mockDataLinksSearch([{ id: "dl-123", name: "test-data-link" }]);

      const scope = nock(BASE_URL)
        .get(new RegExp("/data-links/dl-123/browse.*"))
        .query((q) => q.search === "data_")
        .reply(200, { objects: [] });

      await listDataLink(RED, node, {});

      expect(scope.isDone()).toBe(true);
    });

    it("should warn on invalid regex pattern and continue", async () => {
      node = createDataLinkNode({ patternProp: "[invalid(regex", patternPropType: "str" });

      api.mockDataLinksSearch([{ id: "dl-123", name: "test-data-link" }]);
      api.mockDataLinkBrowse("dl-123", [{ name: "file.txt", type: "FILE" }]);

      const result = await listDataLink(RED, node, {});

      expect(node.warn).toHaveBeenCalledWith(expect.stringContaining("Invalid regex pattern"));
      // Should return all items since regex failed
      expect(result.items).toHaveLength(1);
    });

    it("should evaluate properties from message", async () => {
      node = createDataLinkNode({
        dataLinkNameProp: "linkName",
        dataLinkNamePropType: "msg",
      });

      // Set up RED.util.evaluateNodeProperty to handle msg type
      RED.util.evaluateNodeProperty.mockImplementation((value, type, n, msg) => {
        if (type === "msg") return msg[value];
        if (type === "str") return value;
        if (type === "num") return Number(value);
        return value;
      });

      api.mockDataLinksSearch([{ id: "dl-123", name: "dynamic-link" }]);
      api.mockDataLinkBrowse("dl-123", [{ name: "file.txt", type: "FILE" }]);

      const msg = createMockMsg({ linkName: "dynamic-link" });
      const result = await listDataLink(RED, node, msg);

      expect(result.items).toHaveLength(1);
    });

    it("should use workspace ID from seqeraConfig when not overridden", async () => {
      const seqeraConfig = createMockSeqeraConfigNode({ workspaceId: "config-ws-id" });
      node = createDataLinkNode({ seqeraConfig });

      const searchScope = nock(BASE_URL)
        .get("/data-links/")
        .query((q) => q.workspaceId === "config-ws-id")
        .reply(200, { dataLinks: [{ id: "dl-123", name: "test-data-link" }] });

      const browseScope = nock(BASE_URL)
        .get(new RegExp("/data-links/dl-123/browse.*"))
        .query((q) => q.workspaceId === "config-ws-id")
        .reply(200, { objects: [] });

      await listDataLink(RED, node, {});

      expect(searchScope.isDone()).toBe(true);
      expect(browseScope.isDone()).toBe(true);
    });

    it("should stop recursion when maxResults reached", async () => {
      node = createDataLinkNode({
        depthProp: "2",
        depthPropType: "num",
        maxResultsProp: "2",
        maxResultsPropType: "num",
      });

      api.mockDataLinksSearch([{ id: "dl-123", name: "test-data-link" }]);

      // Root with many items
      nock(BASE_URL)
        .get(/\/data-links\/dl-123\/browse\/?$/)
        .query(true)
        .reply(200, {
          objects: [
            { name: "file1.txt", type: "FILE" },
            { name: "file2.txt", type: "FILE" },
            { name: "folder", type: "FOLDER" },
          ],
        });

      const result = await listDataLink(RED, node, {});

      // maxResults=2 limits the returned items
      expect(result.items).toHaveLength(2);
    });

    it("should prepend folder path to nested file names", async () => {
      node = createDataLinkNode({ depthProp: "1", depthPropType: "num" });

      api.mockDataLinksSearch([{ id: "dl-123", name: "test-data-link" }]);

      nock(BASE_URL)
        .get(/\/data-links\/dl-123\/browse\/?$/)
        .query(true)
        .reply(200, {
          objects: [{ name: "folder", type: "FOLDER" }],
        });

      nock(BASE_URL)
        .get(/\/data-links\/dl-123\/browse\/folder/)
        .query(true)
        .reply(200, {
          objects: [{ name: "nested.txt", type: "FILE" }],
        });

      const result = await listDataLink(RED, node, {});

      expect(result.files).toContain("folder/nested.txt");
    });

    it("should use default maxResults of 100", async () => {
      node = createDataLinkNode({ maxResultsProp: "", maxResultsPropType: "str" });

      api.mockDataLinksSearch([{ id: "dl-123", name: "test-data-link" }]);

      // Create 150 items
      const objects = Array.from({ length: 150 }, (_, i) => ({
        name: `file${i}.txt`,
        type: "FILE",
      }));

      api.mockDataLinkBrowse("dl-123", objects);

      const result = await listDataLink(RED, node, {});

      expect(result.items).toHaveLength(100);
    });

    it("should handle empty browse response", async () => {
      node = createDataLinkNode();

      api.mockDataLinksSearch([{ id: "dl-123", name: "test-data-link" }]);
      api.mockDataLinkBrowse("dl-123", []);

      const result = await listDataLink(RED, node, {});

      expect(result.items).toEqual([]);
      expect(result.files).toEqual([]);
    });
  });
});
