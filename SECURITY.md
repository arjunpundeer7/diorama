# Security policy

diorama runs code inside apps where people are signed in, so security reports matter.

## Reporting

Please report problems privately through
[GitHub security advisories](https://github.com/arjunpundeer7/diorama/security/advisories/new),
not in a public issue. Include what an attacker could do, and steps to reproduce.

You'll get a reply within a week. Fixes go out in a new release, with credit to you if
you'd like it.

## In scope

- Theme code escaping the sandboxed renderer frame or reaching the network.
- The runtime exposing anything from the host app.
- `diorama apply` or `restore` leaving an app or config file in a broken or weaker state.
- The DevTools port used by `diorama launch` being reachable beyond 127.0.0.1.

How the sandbox works and what each command changes is described in
[docs/security.md](docs/security.md).
