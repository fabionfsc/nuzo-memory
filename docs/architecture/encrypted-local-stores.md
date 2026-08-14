# Encrypted Local Stores Decision

Status: evaluated for `1.2.0`; built-in store encryption is not implemented.

## Decision

Nuzo keeps SQLite plus owner-only runtime files as its final storage contract.
Operators who require encryption at rest should place the Nuzo store and its
backups on an operating-system-managed encrypted disk, home directory, or
volume. Nuzo does not add a passphrase format, keychain integration, SQLCipher
dependency, or encrypted export format in `1.2.0`.

This is a deliberate security decision, not a claim that permissions provide
encryption. It avoids shipping a cryptographic mode whose unattended startup,
recovery, native builds, and backup behavior cannot be supported after the
final release.

## Threat Boundary

Encryption at rest can help when a powered-off disk, detached volume, copied
database, or unmanaged backup is obtained without its key. It does not protect
memory after an authorized process unlocks the store, and it does not defend
against same-user malware, a compromised host agent, debuggers, an
administrator, or a captured plaintext export.

Nuzo's existing `0600` files and `0700` directories reduce accidental access
between local accounts on platforms with POSIX permission semantics. They are
not encryption. Windows permission semantics are reported as unsupported by
Nuzo rather than being represented as POSIX-equivalent protection.

## Options Considered

| Option | Useful protection | Startup and recovery | Portability and maintenance | Decision |
| --- | --- | --- | --- | --- |
| Owner-only SQLite files | Accidental access by other unprivileged accounts | No new key or recovery path | Existing tested baseline | Keep, while documenting that it is not encryption. |
| OS full-disk, home, or volume encryption | Offline device, disk, and detached-volume access | Uses the operator's existing OS unlock and recovery process | Outside Nuzo's native dependency surface | Recommended deployment control. |
| Nuzo passphrase-encrypted container | Copied store without the passphrase | Interactive prompt conflicts with stdio MCP startup and unattended hooks; environment/config passphrases weaken the boundary | Requires a new container, atomic migration, key derivation, rotation, recovery, and crash-safe tooling | Reject for the final release. |
| SQLCipher with an interactive passphrase | Copied SQLite database and its encrypted pages | Same unattended unlock problem; a lost passphrase makes the store unrecoverable | Adds a native cryptographic SQLite distribution and a new Linux/macOS/Windows and Node 22/24 build matrix | Reject for the final release. |
| SQLCipher with OS keychain/secret store | Copied database outside the unlocked account | Headless Linux, locked sessions, service accounts, prompts, key rotation, and recovery differ by platform | Adds platform adapters plus SQLCipher and cannot protect against the same unlocked user | Reject for the final release. |
| SQLCipher with a key in config or environment | Copied database without the separately held key | Easy unattended startup | Config, shell inheritance, diagnostics, process inspection, and backups can expose or co-locate the key | Reject as misleading protection. |

Application-layer encryption of individual columns was also rejected. SQLite
FTS needs searchable plaintext or a separate derived index, metadata remains
visible, and ad hoc field encryption complicates equality, migration,
integrity, and deletion without delivering whole-store protection.

## Backup, Export, And Migration Consequences

An encrypted-store feature would need all of these contracts before it could be
safe:

- crash-safe plaintext-to-encrypted and encrypted-to-plaintext migration with a
  separately validated recovery backup;
- key rotation and versioning, including interrupted rotation;
- explicit rules for WAL/SHM files, semantic sidecars, temporary files, and
  SQLite online backups;
- a choice between encrypted backups that require the same key and portable
  backups re-encrypted under a distinct recovery key;
- clear warnings that Markdown and JSON exports are plaintext unless a new
  authenticated encrypted-export format is selected explicitly;
- failure-closed startup for missing, locked, rotated, or inaccessible keys;
- native package validation on every supported operating system and Node line.

Unattended MCP servers and lifecycle hooks cannot safely stop for a terminal
passphrase prompt. Supplying the passphrase silently from the repository,
command line, or normal config would expose it to the same host boundary that
can already read unlocked memory. A platform keychain can improve key custody,
but it still needs user-session and recovery semantics that Nuzo cannot support
consistently across its final compatibility matrix.

SQLite backups and Nuzo JSON/Markdown exports should therefore be treated as
sensitive data. Store them only on operator-approved encrypted media or in an
encrypted backup system, and test recovery while the required OS keys remain
available.

## Operator Guidance

- Enable full-disk or encrypted-volume protection appropriate to the operating
  system before storing sensitive memory.
- Keep the runtime store, semantic sidecar, SQLite backups, and exports inside
  the same or a stronger encrypted boundary.
- Use separate stores and OS accounts or volumes for different trust levels.
- Run `nuzo memory doctor --privacy` to inspect Nuzo's content-free local file
  posture; it cannot determine whether the underlying volume is encrypted.
- Do not claim protection from same-user malware or a compromised active host.

Downstream forks may revisit SQLCipher, but should restore active maintenance
and own the full key, migration, recovery, native-build, and export contract
rather than treating a database pragma as a complete feature.

## Primary References

- [SQLCipher API](https://www.zetetic.net/sqlcipher/sqlcipher-api/) documents
  keying before the first database operation and page HMAC integrity behavior.
- [Encrypting a plaintext SQLite database](https://www.zetetic.net/sqlcipher/encrypting-plaintext-databases/)
  documents that migration needs a separate encrypted database and
  `sqlcipher_export`; setting a key does not rewrite an existing plaintext file.
- [Apple Keychain Services](https://developer.apple.com/documentation/security/keychain-services)
  describes the platform-specific encrypted key store and application access
  controls.
- [Windows Data Protection API](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata)
  documents the normal user/logon and machine binding of protected data.
- [Secret Service locking and unlocking](https://specifications.freedesktop.org/secret-service/latest/unlocking.html)
  documents Linux-session lock state, prompts, and unavoidable unlock races.
