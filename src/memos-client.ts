type MemosClientConfig = {
	baseUrl: string;
	accessToken: string;
};

type Memo = {
	name: string;
	uid: string;
	content: string;
	visibility: string;
	state?: string;
	createTime: string;
	updateTime: string;
	displayTime: string;
	tags: string[];
};

type ListMemosResponse = {
	memos: Memo[];
	nextPageToken: string;
};

type Comment = {
	name: string;
	uid: string;
	content: string;
	createTime: string;
	updateTime: string;
	displayTime: string;
};

export type { Memo, Comment, ListMemosResponse, MemosClientConfig };

export class MemosClient {
	private readonly baseUrl: string;
	private readonly accessToken: string;

	constructor(config: MemosClientConfig) {
		this.baseUrl = config.baseUrl.replace(/\/+$/, "");
		this.accessToken = config.accessToken;
	}

	private async request<T>(path: string, options?: RequestInit): Promise<T> {
		const url = `${this.baseUrl}/api/v1${path}`;
		const res = await fetch(url, {
			...options,
			headers: {
				Authorization: `Bearer ${this.accessToken}`,
				"Content-Type": "application/json",
				...options?.headers,
			},
		});

		if (!res.ok) {
			const body = await res.text();
			throw new Error(`Memos API エラー (${res.status}): ${body}`);
		}

		return res.json() as Promise<T>;
	}

	async createMemo(content: string, visibility?: string): Promise<Memo> {
		return this.request<Memo>("/memos", {
			method: "POST",
			body: JSON.stringify({
				content,
				...(visibility && { visibility }),
			}),
		});
	}

	async getMemo(id: string): Promise<Memo> {
		return this.request<Memo>(`/memos/${id}`);
	}

	async updateMemoContent(id: string, content: string): Promise<Memo> {
		return this.request<Memo>(`/memos/${id}?updateMask=content`, {
			method: "PATCH",
			body: JSON.stringify({ content }),
		});
	}

	async setMemoState(id: string, state: "NORMAL" | "ARCHIVED"): Promise<Memo> {
		return this.request<Memo>(`/memos/${id}?updateMask=state`, {
			method: "PATCH",
			body: JSON.stringify({ state }),
		});
	}

	async deleteMemo(id: string): Promise<void> {
		const url = `${this.baseUrl}/api/v1/memos/${id}`;
		const res = await fetch(url, {
			method: "DELETE",
			headers: {
				Authorization: `Bearer ${this.accessToken}`,
			},
		});
		if (!res.ok) {
			const body = await res.text();
			throw new Error(`Memos API エラー (${res.status}): ${body}`);
		}
	}

	async listMemos(
		pageSize?: number,
		pageToken?: string,
		filter?: string,
	): Promise<ListMemosResponse> {
		const params = new URLSearchParams();
		if (pageSize !== undefined) {
			params.set("pageSize", String(pageSize));
		}
		if (pageToken) {
			params.set("pageToken", pageToken);
		}
		if (filter) {
			params.set("filter", filter);
		}

		const query = params.toString();
		const path = query ? `/memos?${query}` : "/memos";

		return this.request<ListMemosResponse>(path);
	}

	async createComment(memoId: string, content: string): Promise<Comment> {
		return this.request<Comment>(`/memos/${memoId}/comments`, {
			method: "POST",
			body: JSON.stringify({ content }),
		});
	}

	async listComments(memoId: string): Promise<Comment[]> {
		return this.request<Comment[]>(`/memos/${memoId}/comments`);
	}
}
