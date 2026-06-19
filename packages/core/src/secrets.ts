import type { SecretFinding, SecretScanner, SecretScanResult } from "./ports.js";

const patterns: Array<{ kind: string; regex: RegExp; message: string }> = [
  {
    kind: "private_key",
    regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
    message: "Private key material should not be stored as memory.",
  },
  {
    kind: "github_token",
    regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/,
    message: "GitHub tokens should not be stored as memory.",
  },
  {
    kind: "npm_token",
    regex: /\bnpm_[A-Za-z0-9]{20,}\b/,
    message: "npm access tokens should not be stored as memory.",
  },
  {
    kind: "provider_api_key",
    regex: /\b(?:sk-(?:proj-|ant-[A-Za-z0-9-]+-)?[A-Za-z0-9_-]{20,}|sk_live_[A-Za-z0-9]{20,}|AIza[A-Za-z0-9_-]{30,})\b/,
    message: "Provider API keys should not be stored as memory.",
  },
  {
    kind: "aws_access_key",
    regex: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
    message: "AWS access keys should not be stored as memory.",
  },
  {
    kind: "jwt",
    regex: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
    message: "JSON Web Tokens should not be stored as memory.",
  },
  {
    kind: "bearer_token",
    regex: /\bBearer\s+(?!(?:redacted|placeholder|example)\b)[A-Za-z0-9._~+/-]{20,}=*\b/i,
    message: "Bearer tokens should not be stored as memory.",
  },
  {
    kind: "credential_url",
    regex: /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis|rediss):\/\/[^:\s/@]+:(?!(?:redacted|password|placeholder|changeme|\*+)@)[^@\s/]{4,}@/i,
    message: "Database URLs containing credentials should not be stored as memory.",
  },
  {
    kind: "session_cookie",
    regex: /\b(?:cookie|set-cookie|session(?:_?id)?)\s*[:=]\s*['"]?(?!(?:redacted|placeholder|example|\*+)\b)[A-Za-z0-9%._~+/=-]{16,}/i,
    message: "Cookie and session values should not be stored as memory.",
  },
  {
    kind: "generic_api_key",
    regex: /\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*['"]?(?!(?:redacted|placeholder|example|changeme|\*+)\b)[A-Za-z0-9._~/-]{16,}/i,
    message: "Credentials should not be stored as memory.",
  },
];

export class RegexSecretScanner implements SecretScanner {
  async scan(content: string): Promise<SecretScanResult> {
    const findings: SecretFinding[] = [];

    for (const pattern of patterns) {
      if (pattern.regex.test(content)) {
        findings.push({
          kind: pattern.kind,
          message: pattern.message,
        });
      }
    }

    return {
      ok: findings.length === 0,
      findings,
    };
  }
}
