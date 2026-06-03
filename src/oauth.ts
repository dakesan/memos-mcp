import { createRemoteJWKSet, type JWTPayload, jwtVerify } from "jose";

interface AuthServerMetadata {
	issuer?: string;
	jwks_uri?: string;
}

export interface OAuthConfig {
	/** Authorization server issuer base URL (e.g. a Descope project URL). */
	issuer: string;
	/** Canonical resource URL this server represents (RFC 8707 audience). */
	resource: string;
}

/**
 * Build a Bearer-JWT verifier for an OAuth-protected MCP endpoint.
 *
 * The JWKS URI is discovered lazily from the issuer's authorization-server
 * metadata (RFC 8414, with OIDC discovery as a fallback) so the issuer is the
 * only IdP-specific value the server needs — nothing is hard-coded per provider.
 */
export function createJwtVerifier({ issuer, resource }: OAuthConfig) {
	let jwksPromise: Promise<ReturnType<typeof createRemoteJWKSet>> | null = null;
	// Default to the configured issuer; replaced by the value advertised in the
	// discovered metadata (handles trailing-slash / canonicalization differences).
	let expectedIssuer = issuer;

	async function getJwks() {
		if (!jwksPromise) {
			jwksPromise = (async () => {
				const base = issuer.replace(/\/+$/, "");
				const candidates = [
					`${base}/.well-known/oauth-authorization-server`,
					`${base}/.well-known/openid-configuration`,
				];
				let meta: AuthServerMetadata | null = null;
				let lastError: unknown;
				for (const url of candidates) {
					try {
						const res = await fetch(url);
						if (res.ok) {
							meta = (await res.json()) as AuthServerMetadata;
							break;
						}
						lastError = new Error(`${url} -> HTTP ${res.status}`);
					} catch (err) {
						lastError = err;
					}
				}
				if (!meta?.jwks_uri) {
					throw new Error(
						`Could not discover jwks_uri from issuer ${issuer}: ${String(lastError)}`,
					);
				}
				if (meta.issuer) {
					expectedIssuer = meta.issuer;
				}
				return createRemoteJWKSet(new URL(meta.jwks_uri));
			})();
		}
		return jwksPromise;
	}

	return async function verify(token: string): Promise<JWTPayload> {
		const jwks = await getJwks();
		const { payload } = await jwtVerify(token, jwks, {
			issuer: expectedIssuer,
			audience: resource,
		});
		return payload;
	};
}
