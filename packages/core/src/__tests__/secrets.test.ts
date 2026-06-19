import { describe, expect, it } from "vitest";
import { RegexSecretScanner } from "../index.js";

const blocked = [
  ["private_key", "-----BEGIN PRIVATE KEY-----\nfake-private-key-material"],
  ["github_token", "ghp_123456789012345678901234567890123456"],
  ["npm_token", "npm_1234567890abcdefghijklmnopqrstuvwxyz"],
  ["provider_api_key", "sk-proj-abcdefghijklmnopqrstuvwxyz123456"],
  ["provider_api_key", "sk-ant-api03-abcdefghijklmnopqrstuvwxyz123456"],
  ["provider_api_key", "AIzaSyA12345678901234567890123456789012"],
  ["aws_access_key", "AKIAIOSFODNN7EXAMPLE"],
  [
    "jwt",
    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signaturevalue123",
  ],
  ["bearer_token", "Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456"],
  ["credential_url", "postgresql://demo:supersensitive@localhost:5432/app"],
  ["session_cookie", "session_id=abcdefghijklmnopqrstuvwxyz123456"],
] as const;

const allowed = [
  "Set OPENAI_API_KEY in the environment.",
  "Use Authorization: Bearer <token> in the example.",
  "The password is REDACTED.",
  "postgresql://demo:password@localhost:5432/app",
  "session_id=placeholder",
  "cookie=****************",
  "Rotate the leaked credential instead of storing it.",
];

describe("RegexSecretScanner", () => {
  it.each(blocked)("detects %s values", async (kind, content) => {
    const result = await new RegexSecretScanner().scan(content);

    expect(result.ok).toBe(false);
    expect(result.findings).toEqual([
      expect.objectContaining({
        kind,
      }),
    ]);
  });

  it.each(allowed)("allows safe documentation text: %s", async (content) => {
    await expect(new RegexSecretScanner().scan(content)).resolves.toEqual({
      ok: true,
      findings: [],
    });
  });
});
