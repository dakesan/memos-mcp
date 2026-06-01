import type { Comment, ListMemosResponse, Memo } from "./memos-client.ts";

function indentBlock(text: string, indent: string): string {
	return text
		.split("\n")
		.map((line) => `${indent}${line}`)
		.join("\n");
}

/** フォーマット済み文字列をYAMLリストアイテムとして整形する */
function asListItem(formatted: string, indent: string): string {
	const [first, ...rest] = formatted.split("\n");
	const subsequent = rest.map((line) => `${indent}  ${line}`).join("\n");
	return subsequent
		? `${indent}- ${first}\n${subsequent}`
		: `${indent}- ${first}`;
}

export function formatMemo(memo: Memo): string {
	const tags = memo.tags.join(", ");

	const lines = [`name: ${memo.name}`];
	if (memo.state) {
		lines.push(`state: ${memo.state}`);
	}
	lines.push(
		`createTime: ${memo.createTime}`,
		`visibility: ${memo.visibility}`,
		`tags: [${tags}]`,
		"content: |",
		indentBlock(memo.content, "  "),
	);
	return lines.join("\n");
}

export function formatMemoList(result: ListMemosResponse): string {
	const lines = [`count: ${result.memos.length}`];

	if (result.nextPageToken) {
		lines.push(`nextPageToken: ${result.nextPageToken}`);
	}

	lines.push("memos:");

	for (const memo of result.memos) {
		lines.push(asListItem(formatMemo(memo), "  "));
	}

	return lines.join("\n");
}

export function formatComment(comment: Comment): string {
	return [
		`name: ${comment.name}`,
		`createTime: ${comment.createTime}`,
		"content: |",
		indentBlock(comment.content, "  "),
	].join("\n");
}

export function formatCommentList(comments: Comment[]): string {
	const lines = [`count: ${comments.length}`, "comments:"];

	for (const comment of comments) {
		lines.push(asListItem(formatComment(comment), "  "));
	}

	return lines.join("\n");
}
