import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { MemosClient } from "./memos-client.ts";
import { createMcpServer } from "./server.ts";

const baseUrl = process.env.MEMOS_BASE_URL;
const accessToken = process.env.MEMOS_ACCESS_TOKEN;

if (!baseUrl || !accessToken) {
	console.error(
		"Missing required environment variables: MEMOS_BASE_URL, MEMOS_ACCESS_TOKEN",
	);
	process.exit(1);
}

const client = new MemosClient({ baseUrl, accessToken });
const mcpServer = createMcpServer(client);

if (process.argv.includes("--http")) {
	const { StreamableHTTPTransport } = await import("@hono/mcp");
	const { serve } = await import("@hono/node-server");
	const { Hono } = await import("hono");
	const { timingSafeEqual } = await import("node:crypto");

	const port = process.env.PORT ? Number(process.env.PORT) : 0;

	// Auth is mandatory in HTTP mode: this endpoint is meant to be reachable over
	// the network (e.g. via a Tailscale Funnel), and the MCP tools grant full
	// read/write/delete access to every memo. Refuse to start without a secret so
	// an unauthenticated endpoint is never exposed by accident.
	const authToken = process.env.MCP_AUTH_TOKEN;
	if (!authToken) {
		console.error(
			"Refusing to start HTTP mode without MCP_AUTH_TOKEN. " +
				"Set MCP_AUTH_TOKEN to a strong secret to protect the /mcp endpoint.",
		);
		process.exit(1);
	}

	// Constant-time credential comparison; tolerant of length mismatch.
	const expectedToken = Buffer.from(authToken);
	const isValidToken = (provided: string): boolean => {
		const got = Buffer.from(provided);
		if (got.length !== expectedToken.length) {
			return false;
		}
		return timingSafeEqual(got, expectedToken);
	};

	const transport = new StreamableHTTPTransport();
	await mcpServer.connect(transport);

	const app = new Hono();

	// Gate the MCP endpoint. Accept the secret via Authorization: Bearer <token>,
	// X-API-Key: <token>, or ?key=<token> so it works regardless of how the
	// client (e.g. a Claude remote connector) is able to present credentials.
	app.use("/mcp", async (c, next) => {
		const authHeader = c.req.header("Authorization") ?? "";
		const bearer = authHeader.startsWith("Bearer ")
			? authHeader.slice("Bearer ".length)
			: "";
		const provided =
			bearer || c.req.header("X-API-Key") || c.req.query("key") || "";
		if (!isValidToken(provided)) {
			return c.json({ error: "unauthorized" }, 401);
		}
		await next();
	});

	app.all("/mcp", (c) => transport.handleRequest(c));
	app.get("/health", (c) => c.json({ status: "ok" }));

	serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, (info) => {
		console.error(
			`ruru-memos-mcp server running on http://localhost:${info.port}`,
		);
		console.error(`MCP endpoint: http://localhost:${info.port}/mcp`);
	});
} else {
	const transport = new StdioServerTransport();
	await mcpServer.connect(transport);
}
