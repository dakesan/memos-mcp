import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatMemo, formatMemoList } from "../format.ts";
import type { MemosClient } from "../memos-client.ts";

export function registerMemoTools(
	server: McpServer,
	client: MemosClient,
): void {
	server.registerTool(
		"create_memo",
		{
			description: "メモを作成する",
			inputSchema: {
				content: z.string().describe("メモの本文"),
				visibility: z
					.enum(["PRIVATE", "PROTECTED", "PUBLIC"])
					.optional()
					.describe("公開範囲（デフォルト: サーバー設定に従う）"),
			},
		},
		async (args) => {
			const memo = await client.createMemo(args.content, args.visibility);

			return {
				content: [
					{
						type: "text" as const,
						text: formatMemo(memo),
					},
				],
			};
		},
	);

	server.registerTool(
		"search_memos",
		{
			description: "キーワードやタグでメモを検索する",
			inputSchema: {
				query: z
					.string()
					.optional()
					.describe("検索キーワード（メモ本文から検索）"),
				tag: z.string().optional().describe("タグで絞り込み（例: diary）"),
				pageSize: z.number().optional().describe("取得件数（デフォルト: 10）"),
			},
		},
		async (args) => {
			const filters: string[] = [];
			if (args.query) {
				filters.push(`content.contains("${args.query}")`);
			}
			if (args.tag) {
				filters.push(`"${args.tag}" in tags`);
			}

			const filter = filters.length > 0 ? filters.join(" && ") : undefined;
			const result = await client.listMemos(args.pageSize, undefined, filter);

			if (result.memos.length === 0) {
				return {
					content: [
						{
							type: "text" as const,
							text: "メモが見つかりませんでした",
						},
					],
				};
			}

			return {
				content: [
					{
						type: "text" as const,
						text: formatMemoList(result),
					},
				],
			};
		},
	);

	server.registerTool(
		"list_memos",
		{
			description:
				'メモの一覧を取得する。filter パラメータで CEL 式によるフィルタが可能（例: content.contains("keyword")）',
			inputSchema: {
				pageSize: z.number().optional().describe("取得件数（デフォルト: 10）"),
				filter: z
					.string()
					.optional()
					.describe('CEL 式フィルタ（例: content.contains("keyword")）'),
			},
		},
		async (args) => {
			const result = await client.listMemos(
				args.pageSize,
				undefined,
				args.filter,
			);

			if (result.memos.length === 0) {
				return {
					content: [
						{
							type: "text" as const,
							text: "メモが見つかりませんでした",
						},
					],
				};
			}

			return {
				content: [
					{
						type: "text" as const,
						text: formatMemoList(result),
					},
				],
			};
		},
	);
}
