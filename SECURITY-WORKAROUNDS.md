# Security Workarounds

## MySQL Authentication

SECURITY-WORKAROUND: RUSTSEC-2023-0071, SQLx MySQL 0.8.6, reviewed 2026-10-31, next review 2026-11-30.

The upstream SQLx MySQL driver depends on an RSA implementation affected by the Marvin timing vulnerability. The RustSec advisory lists no fixed release. The vendored driver retains its upstream implementation except for the authentication branch that encrypts a password with that RSA implementation: it requires TLS instead and removes the RSA dependency. TLS authentication sends the password inside the encrypted connection, using the existing upstream path. The driver contains no private-key implementation from the affected crate.

MySQL SHA-256 password authentication therefore requires a TLS connection. Local database-matrix tests use `ssl-mode=required` against the real servers' local certificates. Production should use certificate and hostname verification with the deployment's trusted CA. MariaDB's native challenge-response path remains supported; production connections should use verified TLS there as well.

Remove the vendored patch and restore the registry dependency when an upstream SQLx release no longer requires the affected RSA implementation and the supported database matrix passes. The audit remains enabled. The documentation contract fails after the review date until this workaround has been reassessed.

Source: https://rustsec.org/advisories/RUSTSEC-2023-0071

## Markdown Math Dependency

SECURITY-WORKAROUND: GHSA-238p-pmpm-9mq7, transitive KaTeX dependency, reviewed 2026-10-31, next review 2026-11-30.

Milkdown's transitive Markdown math parser permits a KaTeX range affected by a trust-restriction bypass. The npm override selects KaTeX 0.19.1 or a compatible later fix. The editor's math feature is disabled, but the production dependency audit still checks the complete installed dependency tree.

Remove the override when every upstream dependency resolves to a patched KaTeX version without it and the editor and dependency audit pass.

Source: https://github.com/advisories/GHSA-238p-pmpm-9mq7
