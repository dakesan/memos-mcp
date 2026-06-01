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
			const autoTag = process.env.MEMOS_AUTO_TAG?.trim();
			const content =
				autoTag && autoTag.length > 0
					? `${args.content}\n\n${autoTag}`
					: args.content;
			const memo = await client.createMemo(content, args.visibility);

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

	server.registerTool(
		"get_memo",
		{
			description:
				"単一メモを取得する。name の uid 部分（memos/<uid> の <uid>）を渡す",
			inputSchema: {
				id: z
					.string()
					.describe("メモの uid（name が memos/<uid> の場合の <uid> 部分）"),
			},
		},
		async (args) => {
			const memo = await client.getMemo(args.id);
			return {
				content: [{ type: "text" as const, text: formatMemo(memo) }],
			};
		},
	);

	server.registerTool(
		"update_memo",
		{
			description:
				"既存メモの本文を書き換える（reformat 等）。返り値に書き換え前の元本文(previousContent)を含むので、上書き前に必ず保全すること。破壊的操作のため、organize ワークフローでは事前バックアップ必須。",
			inputSchema: {
				id: z.string().describe("メモの uid（memos/<uid> の <uid>）"),
				content: z
					.string()
					.describe("新しい本文（既存本文を完全に置き換える）"),
			},
		},
		async (args) => {
			const before = await client.getMemo(args.id);
			const updated = await client.updateMemoContent(args.id, args.content);
			return {
				content: [
					{
						type: "text" as const,
						text: [
							"updated: true",
							"previousContent: |",
							before.content
								.split("\n")
								.map((l) => `  ${l}`)
								.join("\n"),
							"---",
							formatMemo(updated),
						].join("\n"),
					},
				],
			};
		},
	);

	server.registerTool(
		"archive_memo",
		{
			description:
				"メモを ARCHIVED 状態にする（可逆。state を NORMAL に戻せば復元可能）。メモを「消す」際は delete ではなくまず archive を使うこと。state に NORMAL を渡せばアーカイブ解除。",
			inputSchema: {
				id: z.string().describe("メモの uid（memos/<uid> の <uid>）"),
				state: z
					.enum(["ARCHIVED", "NORMAL"])
					.optional()
					.describe("設定する状態（デフォルト: ARCHIVED）"),
			},
		},
		async (args) => {
			const memo = await client.setMemoState(args.id, args.state ?? "ARCHIVED");
			return {
				content: [{ type: "text" as const, text: formatMemo(memo) }],
			};
		},
	);

	server.registerTool(
		"delete_memo",
		{
			description:
				"メモを物理削除する。【不可逆】復元できない。通常は archive_memo で ARCHIVED にする方を推奨。本当に削除して良いと確認できた場合のみ使用すること。",
			inputSchema: {
				id: z.string().describe("メモの uid（memos/<uid> の <uid>）"),
			},
		},
		async (args) => {
			await client.deleteMemo(args.id);
			return {
				content: [
					{
						type: "text" as const,
						text: `deleted: true\nname: memos/${args.id}`,
					},
				],
			};
		},
	);
}
