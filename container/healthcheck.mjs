import http from "node:http";

const request = http.get({ hostname: "127.0.0.1", port: 3000, path: "/api/health", timeout: 2000 }, (response) => {
  let body = "";
  response.setEncoding("utf8");
  response.on("data", (chunk) => { body += chunk; });
  response.on("end", () => process.exit(response.statusCode === 200 && body === '{"status":"ok"}' ? 0 : 1));
});
request.on("timeout", () => request.destroy());
request.on("error", () => process.exit(1));
