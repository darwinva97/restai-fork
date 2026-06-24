import { hash, verify } from "@node-rs/argon2";
import type { PasswordHasher } from "../../core/ports/password-hasher.js";
import { pbkdf2Verify } from "./webcrypto.adapter.js";

/**
 * Adaptador de hashing con argon2 (binario nativo @node-rs/argon2).
 * Recomendado en contenedor/Node. No corre en edge/Workers.
 */
export class Argon2Hasher implements PasswordHasher {
  hash(password: string): Promise<string> {
    return hash(password);
  }

  // Dual-format verify: existing users carry argon2 hashes ($argon2id$...),
  // while a password set on a pbkdf2 (Worker/edge) runtime is `pbkdf2$...`.
  // Route by prefix so a hybrid fleet or a runtime switch never locks anyone
  // out. argon2 verify() throws on a non-argon2 string, hence the guard.
  verify(hashed: string, password: string): Promise<boolean> {
    if (hashed.startsWith("$argon2")) return verify(hashed, password);
    if (hashed.startsWith("pbkdf2$")) return pbkdf2Verify(hashed, password);
    return Promise.resolve(false);
  }
}
