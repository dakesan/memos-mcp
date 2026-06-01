import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts"],
	format: "esm",
	target: "node22",
	outDir: "dist",
	clean: true,
	// Emit a single self-contained file (disable ESM code-splitting into chunks).
	splitting: false,
	// Bundle all dependencies into a single file so the built dist/index.js runs
	// without node_modules. This lets the Claude Code plugin ship a committed dist
	// and start the stdio MCP server immediately on install (no build/install hook).
	noExternal: [/.*/],
	banner: {
		js: "#!/usr/bin/env node",
	},
});
