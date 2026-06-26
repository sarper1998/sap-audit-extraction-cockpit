const fs = require("fs");
const path = require("path");
const express = require("express");
const { executeHttpRequest } = require("@sap-cloud-sdk/http-client");

const app = express();
const port = process.env.PORT || 4004;
const destinationName = process.env.S4_DESTINATION || "S4HANA_AUDIT_BACKEND";
const allowedPrefixes = (process.env.S4_ALLOWED_PREFIXES || "/sap/opu/odata,/sap/opu/odata4,/sap/bc/http/sap")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

const metadataPath = path.resolve(__dirname, "..", "app", "audit-cockpit", "data", "audit-program.json");

app.use(express.json({ limit: "1mb" }));

function readMetadata() {
  return JSON.parse(fs.readFileSync(metadataPath, "utf8"));
}

function assertAllowedPath(apiPath) {
  if (!apiPath || typeof apiPath !== "string" || !apiPath.startsWith("/")) {
    const error = new Error("API path must start with '/'.");
    error.statusCode = 400;
    throw error;
  }

  if (!allowedPrefixes.some((prefix) => apiPath.startsWith(prefix))) {
    const error = new Error(`API path is not allowed. Allowed prefixes: ${allowedPrefixes.join(", ")}`);
    error.statusCode = 400;
    throw error;
  }
}

function buildPlan(body) {
  const metadata = readMetadata();
  const requestedInput = Array.isArray(body.sources) ? body.sources : [];
  const requestedSources = requestedInput
    .map((item) => String(item).trim().toUpperCase())
    .filter(Boolean);
  const sourceSet = new Set(requestedSources);
  const selectedSources = requestedSources.length
    ? metadata.sources.filter((source) => sourceSet.has(source.name))
    : metadata.sources;
  const selectedNames = new Set(selectedSources.map((table) => table.name));
  const selectedOutputs = metadata.outputFiles.filter((file) => !file.sourceName || selectedNames.has(file.sourceName));

  return {
    generatedAt: new Date().toISOString(),
    client: body.client,
    startDate: body.startDate,
    endDate: body.endDate,
    mode: body.mode || "Background",
    partitionRecords: Number(body.partitionRecords || 100000),
    sourceCount: selectedSources.length,
    outputCount: selectedOutputs.length,
    sources: selectedSources.map((table) => table.name),
    outputFiles: selectedOutputs.map((file) => file.displayName || file.name),
  };
}

async function forwardToS4(method, apiPath, payload) {
  assertAllowedPath(apiPath);
  const response = await executeHttpRequest(
    { destinationName },
    {
      method,
      url: apiPath,
      data: payload,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
    },
  );
  return response.data;
}

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    destinationName,
    allowedPrefixes,
  });
});

app.get("/metadata", (_req, res) => {
  res.json(readMetadata());
});

app.post("/extractions/plan", (req, res) => {
  res.json(buildPlan(req.body || {}));
});

app.post("/s4/odata", async (req, res, next) => {
  try {
    const data = await forwardToS4(req.body?.method || "GET", req.body?.path, req.body?.payload);
    res.json(data);
  } catch (error) {
    next(error);
  }
});

app.post("/s4/read-source", async (req, res, next) => {
  try {
    const sourceObject = String(req.body?.source || req.body?.table || "").trim().toUpperCase();
    if (!/^[A-Z0-9_]+$/.test(sourceObject)) {
      const error = new Error("Source object is required and may only contain A-Z, 0-9, and underscore.");
      error.statusCode = 400;
      throw error;
    }

    const payload = {
      sourceObject,
      fields: Array.isArray(req.body.fields) ? req.body.fields : [],
      filters: Array.isArray(req.body.filters) ? req.body.filters : [],
      top: Number(req.body.top || 1000),
      skip: Number(req.body.skip || 0),
    };

    const data = await forwardToS4("POST", "/sap/bc/http/sap/zaudit_extraction_api/read-source", payload);
    res.json(data);
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  res.status(error.statusCode || error.response?.status || 500).json({
    error: error.message || "API request failed.",
    details: error.response?.data,
  });
});

app.listen(port, () => {
  console.log(`Audit extraction API listening on ${port}`);
});
