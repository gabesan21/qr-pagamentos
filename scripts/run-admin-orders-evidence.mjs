import { spawn } from "node:child_process";
import path from "node:path";

const child = spawn(process.execPath, [path.join("scripts", "run-admin-evidence.mjs"), "--admin-orders"], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
});
const status = await new Promise((resolve, reject) => {
  child.on("error", reject);
  child.on("exit", resolve);
});
if (status !== 0) throw new Error(`Admin orders evidence runtime failed with status ${status}`);
