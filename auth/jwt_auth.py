import jwt
from flask import request, jsonify
from functools import wraps
from config import JWT_SECRET_KEY
from datetime import datetime, timedelta

def create_token(email: str) -> str:
    expiration = datetime.utcnow() + timedelta(days=1)
    return jwt.encode({'email': email, 'exp': expiration}, JWT_SECRET_KEY, algorithm='HS256')

def verify_token(token: str) -> str:
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=['HS256'])
        return payload['email']
    except:
        return None

def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization')
        if not token:
            return jsonify({'error': 'No token provided'}), 401
        token = token.split('Bearer ')[-1]
        email = verify_token(token)
        if not email:
            return jsonify({'error': 'Invalid token'}), 401
        return f(*args, **kwargs)
    return decorated
