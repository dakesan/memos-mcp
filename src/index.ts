import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Context } from "hono";
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

	// Optional OAuth 2.1 (for clients that require it, e.g. the claude.ai custom
	// connector). When OAUTH_ISSUER is set, the /mcp endpoint also accepts a valid
	// Bearer JWT issued by that authorization server, and advertises its location
	// via Protected Resource Metadata (RFC 9728). The static token above keeps
	// working for clients that send it (Claude Code CLI, Desktop via mcp-remote).
	const oauthIssuer = process.env.OAUTH_ISSUER;
	const publicUrl = process.env.MCP_PUBLIC_URL?.replace(/\/+$/, "");
	const oauthEnabled = Boolean(oauthIssuer);
	let resource = "";
	let verifyJwt: ((token: string) => Promise<unknown>) | null = null;
	if (oauthIssuer) {
		if (!publicUrl) {
			console.error(
				"OAUTH_ISSUER is set but MCP_PUBLIC_URL is missing. " +
					"Set MCP_PUBLIC_URL to the public origin (e.g. https://host:10000).",
			);
			process.exit(1);
		}
		resource = `${publicUrl}/mcp`;
		const { createJwtVerifier } = await import("./oauth.ts");
		verifyJwt = createJwtVerifier({ issuer: oauthIssuer, resource });
	}

	const transport = new StreamableHTTPTransport();
	await mcpServer.connect(transport);

	const app = new Hono();

	// Request logging — surfaces how remote clients (e.g. a Claude connector)
	// actually hit the server: path, which credential form arrived, query keys,
	// User-Agent, and the response status.
	app.use("*", async (c, next) => {
		const queryKeys = Object.keys(c.req.query());
		const cred = c.req.header("Authorization")
			? "header:authorization"
			: c.req.header("X-API-Key")
				? "header:x-api-key"
				: queryKeys.includes("key")
					? "query:key"
					: "none";
		await next();
		console.error(
			`[req] ${c.req.method} ${c.req.path} cred=${cred} q=${JSON.stringify(queryKeys)} ua=${JSON.stringify(c.req.header("User-Agent") ?? "")} -> ${c.res.status}`,
		);
	});

	// Protected Resource Metadata (RFC 9728) — lets an OAuth-capable MCP client
	// discover which authorization server guards this resource.
	if (oauthEnabled) {
		const prm = {
			resource,
			authorization_servers: [oauthIssuer],
			scopes_supported: ["mcp:tools/list", "mcp:tools/call"],
		};
		const prmHandler = (c: Context) => c.json(prm);
		app.get("/.well-known/oauth-protected-resource", prmHandler);
		app.get("/.well-known/oauth-protected-resource/mcp", prmHandler);
	}

	// Gate the MCP endpoint. A request is authorized if it presents EITHER the
	// static token (Authorization: Bearer <token>, X-API-Key, or ?key=) — used by
	// Claude Code CLI / Desktop — OR a valid OAuth Bearer JWT — used by the
	// claude.ai custom connector.
	app.use("/mcp", async (c, next) => {
		const authHeader = c.req.header("Authorization") ?? "";
		const bearer = authHeader.startsWith("Bearer ")
			? authHeader.slice("Bearer ".length)
			: "";

		// 1) Static shared secret.
		const staticCred =
			bearer || c.req.header("X-API-Key") || c.req.query("key") || "";
		if (staticCred && isValidToken(staticCred)) {
			await next();
			return;
		}

		// 2) OAuth Bearer JWT (three dot-separated segments).
		if (verifyJwt && bearer.split(".").length === 3) {
			try {
				await verifyJwt(bearer);
				await next();
				return;
			} catch (err) {
				console.error(
					`[oauth] JWT verification failed: ${(err as Error).message}`,
				);
			}
		}

		// 3) Unauthorized. Advertise the resource metadata so OAuth clients can
		// discover the authorization server and start the flow (RFC 9728).
		if (oauthEnabled) {
			c.header(
				"WWW-Authenticate",
				`Bearer resource_metadata="${publicUrl}/.well-known/oauth-protected-resource"`,
			);
		}
		return c.json({ error: "unauthorized" }, 401);
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
