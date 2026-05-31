import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatComment, formatCommentList } from "../format.ts";
import type { MemosClient } from "../memos-client.ts";

/** name フィールド（例: "memos/1"）から数値 ID を抽出する */
function extractMemoId(name: string): string {
	const match = name.match(/^memos\/(\d+)$/);
	if (!match) {
		throw new Error(
			`無効な name 形式です: "${name}"。"memos/数値" の形式で指定してください。list_memos でメモの name を確認してください`,
		);
	}
	return match[1];
}

export function registerCommentTools(
	server: McpServer,
	client: MemosClient,
): void {
	server.registerTool(
		"create_comment",
		{
			description:
				"メモにコメントを追加する。対象メモの name は list_memos で事前に確認すること",
			inputSchema: {
				name: z
					.string()
					.describe(
						"対象メモの name（例: memos/1）。list_memos の結果から取得する",
					),
				content: z.string().describe("コメントの本文"),
			},
		},
		async (args) => {
			let memoId: string;
			try {
				memoId = extractMemoId(args.name);
			} catch (e) {
				return {
					content: [
						{
							type: "text" as const,
							text: (e as Error).message,
						},
					],
					isError: true,
				};
			}

			try {
				const autoTag = process.env.MEMOS_AUTO_TAG?.trim();
				const content =
					autoTag && autoTag.length > 0
						? `${args.content}\n\n${autoTag}`
						: args.content;
				const comment = await client.createComment(memoId, content);

				return {
					content: [
						{
							type: "text" as const,
							text: formatComment(comment),
						},
					],
				};
			} catch (e) {
				return {
					content: [
						{
							type: "text" as const,
							text: `${(e as Error).message}。list_memos でメモの name を確認してください`,
						},
					],
					isError: true,
				};
			}
		},
	);

	server.registerTool(
		"list_comments",
		{
			description:
				"メモのコメント一覧を取得する。対象メモの name は list_memos で事前に確認すること",
			inputSchema: {
				name: z
					.string()
					.describe(
						"対象メモの name（例: memos/1）。list_memos の結果から取得する",
					),
			},
		},
		async (args) => {
			let memoId: string;
			try {
				memoId = extractMemoId(args.name);
			} catch (e) {
				return {
					content: [
						{
							type: "text" as const,
							text: (e as Error).message,
						},
					],
					isError: true,
				};
			}

			try {
				const comments = await client.listComments(memoId);

				if (comments.length === 0) {
					return {
						content: [
							{
								type: "text" as const,
								text: "コメントが見つかりませんでした",
							},
						],
					};
				}

				return {
					content: [
						{
							type: "text" as const,
							text: formatCommentList(comments),
						},
					],
				};
			} catch (e) {
				return {
					content: [
						{
							type: "text" as const,
							text: `${(e as Error).message}。list_memos でメモの name を確認してください`,
						},
					],
					isError: true,
				};
			}
		},
	);
}
