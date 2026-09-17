// Lets a script run modules that import "server-only" outside Next (same as the integration tests).
const Module = require("node:module");
const path = require("node:path");
const original = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === "server-only") return path.join(__dirname, "..", "tests", "stubs", "server-only.ts");
  return original.call(this, request, ...rest);
};
