#!/usr/bin/env python3
"""Re-encrypt NetMap SNMP credentials after PBKDF2 key derivation migration.

Run ONCE after upgrading from SHA256 to PBKDF2 key derivation in crypto.py.

Usage:
  # Set both old and new encryption keys
  export OLD_ENCRYPTION_KEY=<your-old-key>
  export ENCRYPTION_KEY=<your-new-key-or-same-key>

  # Run from api/ directory
  python scripts/migrate_crypto.py

  # If using the SAME key (just changing derivation method):
  export OLD_ENCRYPTION_KEY=mykey
  export ENCRYPTION_KEY=mykey
  python scripts/migrate_crypto.py

Note: If OLD_ENCRYPTION_KEY == ENCRYPTION_KEY, the script re-encrypts using
the new PBKDF2 derivation. This is the expected case — same passphrase,
different derived key.
"""

import os
import sys
import base64
import hashlib
import logging

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

# --- Old key derivation (SHA256, pre-migration) ---
def _old_fernet(key: str) -> Fernet:
    derived = hashlib.sha256(key.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(derived))


# --- New key derivation (PBKDF2, post-migration) ---
_KDF_SALT = b"netmap-fernet-v1"
_KDF_ITERATIONS = 100_000

def _new_fernet(key: str) -> Fernet:
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=_KDF_SALT,
        iterations=_KDF_ITERATIONS,
    )
    derived = kdf.derive(key.encode())
    return Fernet(base64.urlsafe_b64encode(derived))


def migrate():
    old_key = os.environ.get("OLD_ENCRYPTION_KEY", "")
    new_key = os.environ.get("ENCRYPTION_KEY", "")

    if not old_key or not new_key:
        logger.error("Set both OLD_ENCRYPTION_KEY and ENCRYPTION_KEY env vars")
        sys.exit(1)

    old_f = _old_fernet(old_key)
    new_f = _new_fernet(new_key)

    # Connect to database
    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        logger.error("Set DATABASE_URL env var")
        sys.exit(1)

    try:
        import psycopg2
    except ImportError:
        logger.error("Install psycopg2: pip install psycopg2-binary")
        sys.exit(1)

    conn = psycopg2.connect(db_url)
    cur = conn.cursor()

    # Columns that may contain encrypted data
    encrypted_columns = {
        "scan_configs": ["snmp_community", "snmp_v3_auth_password", "snmp_v3_priv_password"],
        "app_settings": ["snmp_community"],
    }

    total_migrated = 0
    total_skipped = 0
    total_errors = 0

    for table, columns in encrypted_columns.items():
        cur.execute(f"SELECT id, {', '.join(columns)} FROM {table}")
        rows = cur.fetchall()

        for row in rows:
            row_id = row[0]
            updates = {}

            for i, col in enumerate(columns):
                value = row[i + 1]
                if not value:
                    continue

                # Try decrypting with old key
                try:
                    plaintext = old_f.decrypt(value.encode()).decode()
                    # Re-encrypt with new key
                    new_ciphertext = new_f.encrypt(plaintext.encode()).decode()
                    updates[col] = new_ciphertext
                    total_migrated += 1
                except InvalidToken:
                    # Not encrypted (plaintext) or already migrated
                    try:
                        # Check if already encrypted with new key
                        new_f.decrypt(value.encode())
                        total_skipped += 1
                        logger.info("  %s.%s (id=%d): Already migrated", table, col, row_id)
                    except InvalidToken:
                        # Plaintext value — encrypt it with new key
                        new_ciphertext = new_f.encrypt(value.encode()).decode()
                        updates[col] = new_ciphertext
                        total_migrated += 1
                        logger.info("  %s.%s (id=%d): Encrypting plaintext value", table, col, row_id)
                except Exception as e:
                    logger.error("  %s.%s (id=%d): Error — %s", table, col, row_id, e)
                    total_errors += 1

            if updates:
                set_clause = ", ".join(f"{col} = %s" for col in updates)
                values = list(updates.values()) + [row_id]
                cur.execute(f"UPDATE {table} SET {set_clause} WHERE id = %s", values)

    if total_errors > 0:
        logger.error("Migration had errors — rolling back")
        conn.rollback()
    else:
        conn.commit()
        logger.info("Migration complete: %d migrated, %d skipped, %d errors", total_migrated, total_skipped, total_errors)

    cur.close()
    conn.close()


if __name__ == "__main__":
    migrate()
