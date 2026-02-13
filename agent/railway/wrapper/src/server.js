import childProcess from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import express from "express";
import httpProxy from "http-proxy";

const PORT = Number.parseInt(process.env.PORT ?? "8080", 10);
const STATE_DIR =
  process.env.OPENCLAW_STATE_DIR?.trim() ||
  path.join(os.homedir(), ".openclaw");
const WORKSPACE_DIR =
  process.env.OPENCLAW_WORKSPACE_DIR?.trim() ||
  path.join(STATE_DIR, "workspace");

const SETUP_PASSWORD = process.env.SETUP_PASSWORD?.trim();

function resolveGatewayToken() {
  const envTok = process.env.OPENCLAW_GATEWAY_TOKEN?.trim();
  if (envTok) return envTok;

  const tokenPath = path.join(STATE_DIR, "gateway.token");
  try {
    const existing = fs.readFileSync(tokenPath, "utf8").trim();
    if (existing) return existing;
  } catch {}

  const generated = crypto.randomBytes(32).toString("hex");
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(tokenPath, generated, { encoding: "utf8", mode: 0o600 });
  } catch {}
  return generated;
}

const OPENCLAW_GATEWAY_TOKEN = resolveGatewayToken();
process.env.OPENCLAW_GATEWAY_TOKEN = OPENCLAW_GATEWAY_TOKEN;

const INTERNAL_GATEWAY_PORT = Number.parseInt(
  process.env.INTERNAL_GATEWAY_PORT ?? "18789",
  10,
);
const INTERNAL_GATEWAY_HOST = process.env.INTERNAL_GATEWAY_HOST ?? "127.0.0.1";
const GATEWAY_TARGET = `http://${INTERNAL_GATEWAY_HOST}:${INTERNAL_GATEWAY_PORT}`;

const OPENCLAW_ENTRY =
  process.env.OPENCLAW_ENTRY?.trim() || "/openclaw/dist/entry.js";
const OPENCLAW_NODE = process.env.OPENCLAW_NODE?.trim() || "node";

function clawArgs(args) {
  return [OPENCLAW_ENTRY, ...args];
}

function configPath() {
  return (
    process.env.OPENCLAW_CONFIG_PATH?.trim() ||
    path.join(STATE_DIR, "openclaw.json")
  );
}

function isConfigured() {
  try {
    return fs.existsSync(configPath());
  } catch {
    return false;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

let gatewayProc = null;
let gatewayStarting = null;

async function waitForGatewayReady(opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${GATEWAY_TARGET}/`, { method: "GET" });
      if (res) {
        console.log("[gateway] ready");
        return true;
      }
    } catch {}
    await sleep(250);
  }
  console.error("[gateway] failed to become ready");
  return false;
}

async function startGateway() {
  if (gatewayProc) return;
  if (!isConfigured()) throw new Error("Gateway cannot start: not configured");

  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.mkdirSync(WORKSPACE_DIR, { recursive: true });

  const args = [
    "gateway",
    "run",
    "--bind",
    "loopback",
    "--port",
    String(INTERNAL_GATEWAY_PORT),
    "--auth",
    "token",
    "--token",
    OPENCLAW_GATEWAY_TOKEN,
  ];

  gatewayProc = childProcess.spawn(OPENCLAW_NODE, clawArgs(args), {
    stdio: "inherit",
    env: {
      ...process.env,
      OPENCLAW_STATE_DIR: STATE_DIR,
      OPENCLAW_WORKSPACE_DIR: WORKSPACE_DIR,
    },
  });

  console.log(`[gateway] starting on port ${INTERNAL_GATEWAY_PORT}`);

  gatewayProc.on("error", (err) => {
    console.error(`[gateway] spawn error: ${String(err)}`);
    gatewayProc = null;
  });

  gatewayProc.on("exit", (code, signal) => {
    console.error(`[gateway] exited code=${code} signal=${signal}`);
    gatewayProc = null;
  });
}

async function ensureGatewayRunning() {
  if (!isConfigured()) return { ok: false, reason: "not configured" };
  if (gatewayProc) return { ok: true };
  if (!gatewayStarting) {
    gatewayStarting = (async () => {
      await startGateway();
      await waitForGatewayReady({ timeoutMs: 60_000 });
    })().finally(() => {
      gatewayStarting = null;
    });
  }
  await gatewayStarting;
  return { ok: true };
}

async function restartGateway() {
  if (gatewayProc) {
    try {
      gatewayProc.kill("SIGTERM");
    } catch {}
    await sleep(750);
    gatewayProc = null;
  }
  return ensureGatewayRunning();
}

function runCmd(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const proc = childProcess.spawn(cmd, args, {
      ...opts,
      env: {
        ...process.env,
        OPENCLAW_STATE_DIR: STATE_DIR,
        OPENCLAW_WORKSPACE_DIR: WORKSPACE_DIR,
      },
    });

    let out = "";
    proc.stdout?.on("data", (d) => (out += d.toString("utf8")));
    proc.stderr?.on("data", (d) => (out += d.toString("utf8")));

    proc.on("error", (err) => {
      out += `\n[spawn error] ${String(err)}\n`;
      resolve({ code: 127, output: out });
    });

    proc.on("close", (code) => resolve({ code: code ?? 0, output: out }));
  });
}

function requireSetupAuth(req, res, next) {
  if (!SETUP_PASSWORD) {
    return res
      .status(500)
      .type("text/plain")
      .send("SETUP_PASSWORD is not set. Set it in Railway Variables.");
  }

  const header = req.headers.authorization || "";
  const [scheme, encoded] = header.split(" ");
  if (scheme !== "Basic" || !encoded) {
    res.set("WWW-Authenticate", 'Basic realm="INFINITE Setup"');
    return res.status(401).send("Auth required");
  }
  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  const idx = decoded.indexOf(":");
  const password = idx >= 0 ? decoded.slice(idx + 1) : "";
  const passwordHash = crypto.createHash("sha256").update(password).digest();
  const expectedHash = crypto.createHash("sha256").update(SETUP_PASSWORD).digest();
  if (!crypto.timingSafeEqual(passwordHash, expectedHash)) {
    res.set("WWW-Authenticate", 'Basic realm="INFINITE Setup"');
    return res.status(401).send("Invalid password");
  }
  return next();
}

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

// Health check
app.get("/setup/healthz", (_req, res) => res.json({ ok: true }));

// Setup page
app.get("/setup", requireSetupAuth, (_req, res) => {
  res.sendFile(path.join(process.cwd(), "src", "public", "setup.html"));
});

// Status API
app.get("/setup/api/status", requireSetupAuth, async (_req, res) => {
  let version = "unknown";
  try {
    const v = await runCmd(OPENCLAW_NODE, clawArgs(["--version"]));
    version = v.output.trim();
  } catch {}

  res.json({
    configured: isConfigured(),
    gatewayRunning: gatewayProc !== null,
    openclawVersion: version,
    stateDir: STATE_DIR,
    workspaceDir: WORKSPACE_DIR,
    gatewayToken: OPENCLAW_GATEWAY_TOKEN,
  });
});

// Run onboarding
app.post("/setup/api/run", requireSetupAuth, async (req, res) => {
  try {
    if (isConfigured()) {
      await ensureGatewayRunning();
      return res.json({
        ok: true,
        output: "Already configured. Gateway is running.",
      });
    }

    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.mkdirSync(WORKSPACE_DIR, { recursive: true });

    const payload = req.body || {};
    const args = [
      "onboard",
      "--non-interactive",
      "--accept-risk",
      "--json",
      "--no-install-daemon",
      "--skip-health",
      "--workspace",
      WORKSPACE_DIR,
      "--gateway-bind",
      "loopback",
      "--gateway-port",
      String(INTERNAL_GATEWAY_PORT),
      "--gateway-auth",
      "token",
      "--gateway-token",
      OPENCLAW_GATEWAY_TOKEN,
      "--flow",
      payload.flow || "quickstart",
    ];

    if (payload.authChoice) {
      args.push("--auth-choice", payload.authChoice);
      const secret = (payload.authSecret || "").trim();
      const flagMap = {
        apiKey: "--anthropic-api-key",
        "openai-api-key": "--openai-api-key",
        "gemini-api-key": "--gemini-api-key",
        "openrouter-api-key": "--openrouter-api-key",
      };
      const flag = flagMap[payload.authChoice];
      if (flag && secret) args.push(flag, secret);
      if (payload.authChoice === "token" && secret) {
        args.push("--token-provider", "anthropic", "--token", secret);
      }
    }

    const onboard = await runCmd(OPENCLAW_NODE, clawArgs(args));
    let extra = `\n[setup] exit=${onboard.code} configured=${isConfigured()}\n`;
    const ok = onboard.code === 0 && isConfigured();

    if (ok) {
      // Configure gateway settings
      await runCmd(
        OPENCLAW_NODE,
        clawArgs(["config", "set", "gateway.controlUi.allowInsecureAuth", "true"]),
      );
      await runCmd(
        OPENCLAW_NODE,
        clawArgs(["config", "set", "gateway.auth.token", OPENCLAW_GATEWAY_TOKEN]),
      );
      await runCmd(
        OPENCLAW_NODE,
        clawArgs(["config", "set", "--json", "gateway.trustedProxies", '["127.0.0.1"]']),
      );

      // Set model if provided
      if (payload.model?.trim()) {
        await runCmd(OPENCLAW_NODE, clawArgs(["models", "set", payload.model.trim()]));
        extra += `[setup] Model set to ${payload.model.trim()}\n`;
      }

      // Configure Telegram if token provided
      if (payload.telegramToken?.trim()) {
        await runCmd(
          OPENCLAW_NODE,
          clawArgs([
            "config", "set", "--json", "channels.telegram",
            JSON.stringify({
              enabled: true,
              dmPolicy: "pairing",
              botToken: payload.telegramToken.trim(),
              groupPolicy: "allowlist",
              streamMode: "partial",
            }),
          ]),
        );
        extra += "[setup] Telegram configured\n";
      }

      // Configure Discord if token provided
      if (payload.discordToken?.trim()) {
        await runCmd(
          OPENCLAW_NODE,
          clawArgs([
            "config", "set", "--json", "channels.discord",
            JSON.stringify({
              enabled: true,
              token: payload.discordToken.trim(),
              groupPolicy: "allowlist",
              dm: { policy: "pairing" },
            }),
          ]),
        );
        extra += "[setup] Discord configured\n";
      }

      extra += "[setup] Starting gateway...\n";
      await restartGateway();
      extra += "[setup] Gateway started.\n";
    }

    return res.status(ok ? 200 : 500).json({
      ok,
      output: `${onboard.output}${extra}`,
    });
  } catch (err) {
    console.error("[/setup/api/run] error:", err);
    return res.status(500).json({ ok: false, output: String(err) });
  }
});

// Reset config
app.post("/setup/api/reset", requireSetupAuth, async (_req, res) => {
  try {
    fs.rmSync(configPath(), { force: true });
    res.type("text/plain").send("Config deleted. You can rerun setup now.");
  } catch (err) {
    res.status(500).type("text/plain").send(String(err));
  }
});

// Doctor
app.post("/setup/api/doctor", requireSetupAuth, async (_req, res) => {
  const result = await runCmd(
    OPENCLAW_NODE,
    clawArgs(["doctor", "--non-interactive", "--repair"]),
  );
  return res.status(result.code === 0 ? 200 : 500).json({
    ok: result.code === 0,
    output: result.output,
  });
});

// Proxy everything else to the gateway
const proxy = httpProxy.createProxyServer({
  target: GATEWAY_TARGET,
  ws: true,
  xfwd: true,
});

proxy.on("error", (err) => console.error("[proxy]", err));

proxy.on("proxyReq", (proxyReq) => {
  proxyReq.setHeader("Authorization", `Bearer ${OPENCLAW_GATEWAY_TOKEN}`);
});

proxy.on("proxyReqWs", (proxyReq) => {
  proxyReq.setHeader("Authorization", `Bearer ${OPENCLAW_GATEWAY_TOKEN}`);
});

app.use(async (req, res) => {
  if (!isConfigured() && !req.path.startsWith("/setup")) {
    return res.redirect("/setup");
  }

  if (isConfigured()) {
    try {
      await ensureGatewayRunning();
    } catch (err) {
      return res.status(503).type("text/plain").send(`Gateway not ready: ${String(err)}`);
    }
  }

  if (req.path === "/" && !req.query.token) {
    return res.redirect(`/?token=${OPENCLAW_GATEWAY_TOKEN}`);
  }

  if (req.path === "/openclaw" && !req.query.token) {
    return res.redirect(`/openclaw?token=${OPENCLAW_GATEWAY_TOKEN}`);
  }

  return proxy.web(req, res, { target: GATEWAY_TARGET });
});

const server = app.listen(PORT, () => {
  console.log(`[INFINITE] listening on port ${PORT}`);
  console.log(`[INFINITE] setup wizard: /setup`);
  console.log(`[INFINITE] configured: ${isConfigured()}`);

  if (isConfigured()) {
    ensureGatewayRunning().catch((err) => {
      console.error(`[INFINITE] failed to start gateway: ${err.message}`);
    });
  }
});

server.on("upgrade", async (req, socket, head) => {
  if (!isConfigured()) {
    socket.destroy();
    return;
  }
  try {
    await ensureGatewayRunning();
  } catch {
    socket.destroy();
    return;
  }

  // Browsers cannot send Authorization headers on WebSocket connections.
  // Inject the gateway token as a query parameter so the gateway accepts it.
  const parsed = new URL(req.url, GATEWAY_TARGET);
  if (!parsed.searchParams.has("token")) {
    parsed.searchParams.set("token", OPENCLAW_GATEWAY_TOKEN);
    req.url = parsed.pathname + parsed.search;
  }

  proxy.ws(req, socket, head, { target: GATEWAY_TARGET });
});

process.on("SIGTERM", () => {
  console.log("[INFINITE] shutting down");
  server.close();
  if (gatewayProc) gatewayProc.kill("SIGTERM");
  process.exit(0);
});
