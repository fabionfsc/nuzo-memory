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
    kind: "generic_api_key",
    regex: /\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*['"]?[A-Za-z0-9._~/-]{16,}/i,
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
