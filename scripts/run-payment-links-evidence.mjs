import { spawn } from "node:child_process";
import path from "node:path";

const child = spawn(process.execPath, [path.join("scripts", "run-admin-evidence.mjs"), "--links"], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
});
const status = await new Promise((resolve, reject) => {
  child.on("error", reject);
  child.on("exit", resolve);
});
if (status !== 0) throw new Error(`Payment-links evidence runtime failed with status ${status}`);
