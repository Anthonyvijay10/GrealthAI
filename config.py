import os
from dotenv import load_dotenv

load_dotenv()

OLLAMA_API_URL = os.getenv("OLLAMA_API_URL", "http://localhost:11434/api")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "gemma3:1b")
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")
HF_API_KEY = os.getenv("HF_API_KEY")

TEMP_AUDIO_DIR = os.path.join(os.getenv("TEMP", "/tmp"), 'health_assistant_audio')
TEMP_UPLOAD_DIR = os.path.join(os.getenv("TEMP", "/tmp"), 'health_assistant_uploads')
BASE_DATA_DIR = os.path.join(os.getcwd(), "AAA")
SESSION_EXPIRATION_HOURS = 24

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'pdf', 'txt'}

EMBEDDING_MODEL = 'all-MiniLM-L6-v2'
INDEX_DIMENSIONS = 384
CHUNK_SIZE = 500
CHUNK_OVERLAP = 100