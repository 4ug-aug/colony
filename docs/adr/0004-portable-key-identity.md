---
status: superseded by ADR-0005
---

# Use a portable key as a person's identity

Sweat identifies a person by a portable secp256k1 public key. A client keeps
the private key and proves possession by signing a fresh, server-bound
challenge; a Sweat server verifies the proof, applies its own workspace
membership policy, and issues a bounded session. The server stores a
workspace-local profile separately from identity. This replaces passwords as
the intended identity boundary while deliberately accepting that reuse of one
public key makes a person linkable across Sweat servers.

This decision borrows Nostr's identity and authentication patterns without
adopting its event protocol or storage model. Per-server keys would reduce
linkability but lose the portable identity being tested, while conventional
username/password accounts would keep identity server-owned.

## Sources

- [NIP-42: Authentication of clients to relays](https://github.com/nostr-protocol/nips/blob/master/42.md)
  defines fresh signed authentication events bound to a challenge and relay
  URL, including freshness and verification requirements.
- [NIP-49: Private Key Encryption](https://github.com/nostr-protocol/nips/blob/master/49.md)
  defines a password-encrypted, portable private-key representation and key
  derivation requirements.
- [NIP-46: Nostr Remote Signing](https://github.com/nostr-protocol/nips/blob/master/46.md)
  separates a user-facing client from the signer that controls the user's key;
  remote signing is a possible later extension, not part of the first slice.
- [Buzz](https://github.com/block/buzz) demonstrates a Tauri client connecting
  a portable-key identity to an authoritative self-hosted relay.
