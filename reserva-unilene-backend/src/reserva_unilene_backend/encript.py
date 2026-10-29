import hmac
import hashlib
import os

def encrypt_password(password) :
    """
    Encripta una contraseña usando HMAC SHA-512 con una clave secreta fija y luego SHA-256.
    Args:
        password: La contraseña a encriptar (str o bytes).
    Returns:
        tuple: (hmac_sha512_hex, sha256_hex)
    """
    secret_key_str = os.environ.get('SECRET_KEY_LOGIN', '')
    if not secret_key_str:
        raise RuntimeError('SECRET_KEY_LOGIN is not configured')
    if isinstance(password, str):
        password_bytes = password.encode('utf-8')
    else:
        password_bytes = password
    secret_key_bytes = secret_key_str.encode('utf-8')
    # HMAC SHA-512
    hmac_sha512 = hmac.new(secret_key_bytes, password_bytes, hashlib.sha512).digest()
    hmac_sha512_hex = hmac_sha512.hex()
    # SHA-256 sobre el string hexadecimal del HMAC
    sha256_digest = hashlib.sha256(hmac_sha512_hex.encode('utf-8')).hexdigest()
    return  sha256_digest
