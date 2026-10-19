"""Fernet encryption for sensitive fields (SNMP credentials, community strings)"""

import os
import base64
import logging
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

logger = logging.getLogger(__name__)

_fernet: Fernet | None = None

# Fixed salt for key derivation — changing this invalidates all existing encrypted data.
# In production, consider storing this alongside ENCRYPTION_KEY.
_KDF_SALT = b"netmap-fernet-v1"
_KDF_ITERATIONS = 100_000


def _get_fernet() -> Fernet:
    """Get or create Fernet instance from ENCRYPTION_KEY env var."""
    global _fernet
    if _fernet is None:
        key = os.environ.get("ENCRYPTION_KEY", "")
        if not key:
            raise RuntimeError(
                "ENCRYPTION_KEY environment variable is required for credential storage"
            )
        # Derive a valid 32-byte Fernet key using PBKDF2 (100k iterations)
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=_KDF_SALT,
            iterations=_KDF_ITERATIONS,
        )
        derived = kdf.derive(key.encode())
        fernet_key = base64.urlsafe_b64encode(derived)
        _fernet = Fernet(fernet_key)
    return _fernet


def encrypt_value(plaintext: str | None) -> str | None:
    """Encrypt a string value. Returns None if input is None or empty."""
    if not plaintext:
        return plaintext
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt_value(ciphertext: str | None) -> str | None:
    """Decrypt a string value. Returns None if input is None or empty.
    Raises RuntimeError if decryption fails (key mismatch or corrupt data).
    """
    if not ciphertext:
        return ciphertext
    try:
        return _get_fernet().decrypt(ciphertext.encode()).decode()
    except Exception as e:
        logger.error("Decryption failed for stored credential: %s", e)
        raise RuntimeError("Failed to decrypt stored credential — check ENCRYPTION_KEY") from e
