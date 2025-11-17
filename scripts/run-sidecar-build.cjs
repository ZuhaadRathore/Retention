#!/usr/bin/env node

const fs = require("fs");
const { spawnSync } = require("child_process");
const path = require("path");

const script = path.join(__dirname, "build_sidecar.py");
const args = process.argv.slice(2);
const explicitPython = process.env.PYTHON;
const projectRoot = path.resolve(__dirname, "..");

const candidates = [];
const seen = new Set();
const addCandidate = (candidate) => {
  if (!candidate || seen.has(candidate)) {
    return;
  }
  seen.add(candidate);
  candidates.push(candidate);
};

if (explicitPython) {
  addCandidate(explicitPython);
} else {
  const virtualEnv = process.env.VIRTUAL_ENV;
  if (virtualEnv) {
    addCandidate(
      path.join(
        virtualEnv,
        process.platform === "win32" ? "Scripts" : "bin",
        process.platform === "win32" ? "python.exe" : "python"
      )
    );
  }

  addCandidate(
    path.join(
      projectRoot,
      ".venv",
      process.platform === "win32" ? "Scripts" : "bin",
      process.platform === "win32" ? "python.exe" : "python"
    )
  );

  for (const cmd of process.platform === "win32"
    ? ["python", "py", "python3"]
    : ["python3", "python"]) {
    addCandidate(cmd);
  }
}

let pythonCmd = null;
for (const candidate of candidates) {
  if (path.isAbsolute(candidate) && !fs.existsSync(candidate)) {
    continue;
  }

  const check = spawnSync(candidate, ["-c", "import sys"], {
    stdio: "ignore"
  });
  if (check.status === 0) {
    pythonCmd = candidate;
    break;
  }
}

if (!pythonCmd) {
  console.error(
    "Unable to locate a Python interpreter. Set the PYTHON environment variable to the executable path."
  );
  process.exit(1);
}

const result = spawnSync(pythonCmd, [script, ...args], {
  stdio: "inherit",
  cwd: projectRoot
});

if (result.error) {
  console.error(result.error.message);
}

process.exit(result.status ?? 1);
