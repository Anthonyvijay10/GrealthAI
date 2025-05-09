import os
import uuid
import time
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from datetime import datetime, timedelta, timezone
from threading import Thread
from dotenv import load_dotenv
import logging
import json
from gtts import gTTS
import tempfile
import shutil
import pytesseract
from PIL import Image
from werkzeug.utils import secure_filename
import PyPDF2
from google.oauth2 import id_token
from google.auth.transport import requests
from functools import wraps
import jwt
from datetime import datetime, timedelta
import io
import requests as http_requests  # Renamed to avoid conflict with google.auth.transport.requests
import pickle

# Add these new imports for RAG
from sentence_transformers import SentenceTransformer
import numpy as np
import faiss
import glob
import re

pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

# Load environment variables
load_dotenv()

# Configure Flask App
app = Flask(__name__)
CORS(app, supports_credentials=True)
app.secret_key = os.urandom(24)

# Configure Logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

# Ollama API configuration
OLLAMA_API_URL = os.getenv("OLLAMA_API_URL", "http://localhost:11434/api")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "gemma3:1b")

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")

# Create temporary directories
TEMP_AUDIO_DIR = os.path.join(tempfile.gettempdir(), 'health_assistant_audio')
TEMP_UPLOAD_DIR = os.path.join(tempfile.gettempdir(), 'health_assistant_uploads')
os.makedirs(TEMP_AUDIO_DIR, exist_ok=True)
os.makedirs(TEMP_UPLOAD_DIR, exist_ok=True)

# Base directory for user data
BASE_DATA_DIR = os.path.join(os.getcwd(), "AAA")
os.makedirs(BASE_DATA_DIR, exist_ok=True)

# Global session store
sessions = {}
SESSION_EXPIRATION_HOURS = 24

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'pdf', 'txt'}

# Add RAG configuration
EMBEDDING_MODEL = 'all-MiniLM-L6-v2'
INDEX_DIMENSIONS = 384  # Dimensions of the embeddings from all-MiniLM-L6-v2
CHUNK_SIZE = 500
CHUNK_OVERLAP = 100

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

class OllamaChat:
    """Wrapper class for Ollama chat capabilities with streaming support"""
    def __init__(self, model=OLLAMA_MODEL, system_instruction=""):
        self.model = model
        self.system = system_instruction
        self.history = []
    
    def start_chat(self, history=None):
        if history is not None:
            self.history = history
        return self
    
    def send_message(self, message):
        """Send message to Ollama API and get response (non-streaming)"""
        messages = []
        
        # Add system message if available
        if self.system:
            messages.append({"role": "system", "content": self.system})
        
        # Add conversation history
        for entry in self.history:
            if entry["role"] == "user":
                messages.append({"role": "user", "content": entry["content"]})
            else:
                messages.append({"role": "assistant", "content": entry["content"]})
        
        # Add current message
        messages.append({"role": "user", "content": message})
        
        # Make API call to Ollama
        response = http_requests.post(
            f"{OLLAMA_API_URL}/chat",
            json={
                "model": self.model,
                "messages": messages,
                "stream": False
            }
        )
        
        if response.status_code != 200:
            logging.error(f"Ollama API error: {response.text}")
            raise Exception(f"Ollama API returned status {response.status_code}")
        
        result = response.json()
        response_text = result["message"]["content"]
        
        # Update history
        self.history.append({"role": "user", "content": message})
        self.history.append({"role": "assistant", "content": response_text})
        
        # Create a response object with text property to match Gemini API
        class ResponseObj:
            def __init__(self, text):
                self.text = text
        
        return ResponseObj(response_text)
    
# Improved RAG Manager class with persistence
class RAGManager:
    """Manages retrieval-augmented generation for user-specific data with persistence"""
    def __init__(self, user_email):
        self.user_email = user_email
        self.user_folder = os.path.join(BASE_DATA_DIR, user_email)
        self.formilvus_folder = os.path.join(self.user_folder, "formilvus")
        self.vectors_folder = os.path.join(self.user_folder, "vectors")
        
        # Create necessary directories
        os.makedirs(self.formilvus_folder, exist_ok=True)
        os.makedirs(self.vectors_folder, exist_ok=True)
        
        # Path for saving index and metadata
        self.index_path = os.path.join(self.vectors_folder, "faiss_index.bin")
        self.chunks_path = os.path.join(self.vectors_folder, "text_chunks.pkl")
        self.metadata_path = os.path.join(self.vectors_folder, "metadata.json")
        
        # Load existing index and chunks if available
        self.index = None
        self.text_chunks = []
        self._load_vectors()
        
        # Track files that have been processed
        self.processed_files = self._load_metadata().get("processed_files", [])
        
        # Embedding model - loaded on demand
        self.embedding_model = None
        
    def _get_embedding_model(self):
        """Lazy loading of the embedding model"""
        if self.embedding_model is None:
            try:
                self.embedding_model = SentenceTransformer(EMBEDDING_MODEL)
                logging.info(f"Loaded embedding model for user {self.user_email}")
            except Exception as e:
                logging.error(f"Failed to load embedding model: {e}")
                raise
        return self.embedding_model
    
    def _load_vectors(self):
        """Load existing FAISS index and text chunks if available"""
        try:
            if os.path.exists(self.index_path) and os.path.exists(self.chunks_path):
                logging.info(f"Loading existing vector database for user {self.user_email}")
                self.index = faiss.read_index(self.index_path)
                
                with open(self.chunks_path, 'rb') as f:
                    self.text_chunks = pickle.load(f)
                
                logging.info(f"Loaded vector database with {len(self.text_chunks)} chunks for user {self.user_email}")
                return True
            else:
                logging.info(f"No existing vector database found for user {self.user_email}")
                return False
        except Exception as e:
            logging.error(f"Error loading vector database: {e}")
            # Reset to defaults in case of error
            self.index = None
            self.text_chunks = []
            return False
    
    def _save_vectors(self):
        """Save FAISS index and text chunks to disk"""
        try:
            if self.index and self.text_chunks:
                faiss.write_index(self.index, self.index_path)
                
                with open(self.chunks_path, 'wb') as f:
                    pickle.dump(self.text_chunks, f)
                
                logging.info(f"Saved vector database with {len(self.text_chunks)} chunks for user {self.user_email}")
                return True
            return False
        except Exception as e:
            logging.error(f"Error saving vector database: {e}")
            return False
    
    def _load_metadata(self):
        """Load metadata about processed files"""
        if os.path.exists(self.metadata_path):
            try:
                with open(self.metadata_path, 'r') as f:
                    return json.load(f)
            except Exception as e:
                logging.error(f"Error loading metadata: {e}")
        return {"processed_files": [], "last_updated": None}
    
    def _save_metadata(self):
        """Save metadata about processed files"""
        try:
            metadata = {
                "processed_files": self.processed_files,
                "last_updated": datetime.now().isoformat()
            }
            with open(self.metadata_path, 'w') as f:
                json.dump(metadata, f)
            return True
        except Exception as e:
            logging.error(f"Error saving metadata: {e}")
            return False
        
    def get_user_documents(self):
        """Get all text files in the user's formilvus folder"""
        if not os.path.exists(self.formilvus_folder):
            os.makedirs(self.formilvus_folder, exist_ok=True)
            return []
        
        files = glob.glob(os.path.join(self.formilvus_folder, "*.txt"))
        return files
    
    def chunk_document(self, text, doc_source):
        """Split document text into overlapping chunks with improved handling"""
        chunks = []
        # Clean text - remove extra whitespace
        text = re.sub(r'\s+', ' ', text).strip()
        
        # If text is short enough, return it as a single chunk
        if len(text) <= CHUNK_SIZE:
            if len(text) > 20:  # Only include meaningful chunks
                chunks.append({"text": text, "source": doc_source})
            return chunks
            
        # For longer text, create overlapping chunks
        for i in range(0, len(text), CHUNK_SIZE - CHUNK_OVERLAP):
            chunk = text[i:i + CHUNK_SIZE]
            if len(chunk) > 20:  # Only include meaningful chunks
                chunks.append({"text": chunk, "source": doc_source})
        
        return chunks
    
    def update_index_with_new_files(self):
        """Update the index with only new files, preserving existing data"""
        files = self.get_user_documents()
        
        if not files:
            logging.info(f"No documents found for user {self.user_email}")
            return False
        
        # Filter for only new files
        new_files = [f for f in files if os.path.basename(f) not in self.processed_files]
        
        if not new_files:
            logging.info(f"No new documents to process for user {self.user_email}")
            return True  # Return True because the index exists and is up to date
        
        logging.info(f"Processing {len(new_files)} new documents for user {self.user_email}")
        new_chunks = []
        
        # Process each new document
        for file_path in new_files:
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                # Get filename without extension for reference
                file_name = os.path.basename(file_path)
                
                # Split into chunks
                doc_chunks = self.chunk_document(content, file_name)
                new_chunks.extend(doc_chunks)
                
                # Mark file as processed
                self.processed_files.append(file_name)
                    
            except UnicodeDecodeError:
                # Try with different encoding if UTF-8 fails
                try:
                    with open(file_path, 'r', encoding='latin-1') as f:
                        content = f.read()
                    
                    file_name = os.path.basename(file_path)
                    doc_chunks = self.chunk_document(content, file_name)
                    new_chunks.extend(doc_chunks)
                    
                    # Mark file as processed
                    self.processed_files.append(file_name)
                except Exception as inner_e:
                    logging.error(f"Error processing document {file_path} with latin-1 encoding: {inner_e}")
            except Exception as e:
                logging.error(f"Error processing document {file_path}: {e}")
        
        if not new_chunks:
            logging.info(f"No valid new content chunks found for user {self.user_email}")
            self._save_metadata()  # Save updated metadata even if no new chunks
            return True if self.text_chunks else False
        
        # Create embeddings for new chunks
        try:
            texts = [chunk["text"] for chunk in new_chunks]
            model = self._get_embedding_model()
            new_embeddings = model.encode(texts)
            
            # Get actual dimensions from the model output
            actual_dimensions = new_embeddings.shape[1]
            
            # Create or extend FAISS index
            if self.index is None:
                self.index = faiss.IndexFlatL2(actual_dimensions)
                self.text_chunks = []
            
            # Convert to the right format for FAISS
            faiss_compatible_embeddings = np.array(new_embeddings).astype('float32')
            
            # Check for NaN values
            if np.isnan(faiss_compatible_embeddings).any():
                logging.warning(f"Found NaN values in embeddings for user {self.user_email}, replacing with zeros")
                faiss_compatible_embeddings = np.nan_to_num(faiss_compatible_embeddings)
            
            # Add new embeddings to the index
            self.index.add(faiss_compatible_embeddings)
            
            # Add new chunks to our storage
            self.text_chunks.extend(new_chunks)
            
            # Save the updated index, chunks, and metadata
            self._save_vectors()
            self._save_metadata()
            
            logging.info(f"Updated RAG index for user {self.user_email}, now with {len(self.text_chunks)} total chunks")
            return True
            
        except Exception as e:
            logging.error(f"Error creating embeddings: {e}")
            return False
    
    def retrieve(self, query, top_k=3):
        """Retrieve relevant chunks based on query with improved error handling"""
        if not self.index or not self.text_chunks:
            if not self.update_index_with_new_files():
                logging.warning(f"Could not create/retrieve index for user {self.user_email}")
                return []
        
        if len(self.text_chunks) == 0:
            logging.warning(f"No text chunks available for user {self.user_email}")
            return []
            
        try:
            # Clean and prepare query
            query = query.strip()
            if not query:
                return []
                
            # Get query embedding
            model = self._get_embedding_model()
            query_embedding = model.encode([query])
            
            # Check that no NaNs were produced
            if np.isnan(query_embedding).any():
                logging.warning("Query embedding contains NaN values, replacing with zeros")
                query_embedding = np.nan_to_num(query_embedding)
            
            # Ensure it's the right format for FAISS
            query_vector = np.array(query_embedding).astype('float32')
            
            # Search index
            max_results = min(top_k, len(self.text_chunks))
            D, I = self.index.search(query_vector, max_results)
            
            # Extract relevant chunks
            results = []
            seen_texts = set()  # To avoid duplicates
            
            for idx in I[0]:
                if idx < len(self.text_chunks) and idx >= 0:
                    chunk = self.text_chunks[idx]
                    # Avoid exact duplicates
                    chunk_text = chunk["text"]
                    if chunk_text not in seen_texts:
                        results.append(chunk)
                        seen_texts.add(chunk_text)
            
            return results
            
        except Exception as e:
            logging.error(f"Error retrieving from index: {e}")
            return []
    
    def get_context_for_prompt(self, query, max_chunks=3):
        """Get formatted context from relevant documents for prompt enrichment"""
        if not query or len(query.strip()) < 5:
            return ""  # Don't retrieve for very short queries
            
        relevant_chunks = self.retrieve(query, top_k=max_chunks)
        
        if not relevant_chunks:
            return ""
        
        context = "Here is some relevant information from your documents:\n\n"
        
        for i, chunk in enumerate(relevant_chunks):
            context += f"Document: {chunk['source']}\n"
            context += f"Content: {chunk['text']}\n\n"
        
        return context
    
    def delete_file(self, filename):
        """Delete a file from the index and rebuild the index"""
        if filename in self.processed_files:
            # Remove from processed files list
            self.processed_files.remove(filename)
            
            # Delete the actual file if it exists
            file_path = os.path.join(self.formilvus_folder, filename)
            if os.path.exists(file_path):
                try:
                    os.remove(file_path)
                    logging.info(f"Deleted file {filename} for user {self.user_email}")
                except Exception as e:
                    logging.error(f"Error deleting file {filename}: {e}")
            
            # Reset the index and rebuild from remaining files
            self.index = None
            self.text_chunks = []
            
            # Delete the index files
            if os.path.exists(self.index_path):
                os.remove(self.index_path)
            if os.path.exists(self.chunks_path):
                os.remove(self.chunks_path)
            
            # Save metadata
            self._save_metadata()
            
            # Rebuild index from remaining files
            self.update_index_with_new_files()
            return True
        
        return False
    
    def rebuild_index(self):
        """Force rebuild the entire index"""
        try:
            # Reset the index and metadata
            self.index = None
            self.text_chunks = []
            self.processed_files = []
            
            # Delete all vector files
            if os.path.exists(self.index_path):
                os.remove(self.index_path)
            if os.path.exists(self.chunks_path):
                os.remove(self.chunks_path)
            
            # Save metadata
            self._save_metadata()
            
            # Rebuild index from all files
            success = self.update_index_with_new_files()
            return success
        except Exception as e:
            logging.error(f"Error rebuilding index: {e}")
            return False
    
    def get_document_summary(self):
        """Get a summary of indexed documents"""
        metadata = self._load_metadata()
        return {
            "total_documents": len(self.processed_files),
            "total_chunks": len(self.text_chunks),
            "documents": self.processed_files,
            "last_updated": metadata.get("last_updated", None)
        }

def initialize_session():
    """Initialize a new session with separate chat and insight histories."""
    session_id = str(uuid.uuid4())
    
    # Chat system instruction
    chat_instruction = """You are a healthcare assistant. Your role is to:
    0. You are not allowed to provide code or support for any programming or technical domain.
    1. Provide general health information and guidance only.
    2. Help users understand common medical terms, conditions, and health-related documents.
    3. Suggest when to seek professional medical help.
    4. Offer wellness and preventive health advice.
    5. You understand and can respond in all languages, so give health advice in the language the user speaks.
    6. Always answer health-related questions directly; do not suggest the user should consult a doctor unless it's about treatment or emergency.
    7. When relevant user documents are provided, read and explain the contents clearly to help the user understand their health context, reports, or medical information.
    8. Do not write or return any programming or technical code under any circumstance.

    Important: Always include a disclaimer that you're not a replacement for professional medical advice at the end."""

    
    # Insight system instruction
    insight_instruction = """You are an analytical health insight generator. Your role is to:
    1. Analyze health conversations and identify key patterns
    2. Generate relevant health insights and recommendations
    3. Assess potential health risks and trends
    4. Provide actionable health guidance"""
    
    # Initialize both chat models with Ollama
    chat = OllamaChat(model=OLLAMA_MODEL, system_instruction=chat_instruction).start_chat(history=[])
    insight_chat = OllamaChat(model=OLLAMA_MODEL, system_instruction=insight_instruction).start_chat(history=[])
    
    sessions[session_id] = {
        'chat': chat,
        'insight_chat': insight_chat,
        'chat_history': [],
        'insight_history': [],
        'created_at': datetime.now(timezone.utc),
    }
    
    logging.info(f"New session initialized: {session_id}")
    return session_id


# Authentication functions
def create_token(email: str) -> str:
    expiration = datetime.utcnow() + timedelta(days=1)
    return jwt.encode(
        {'email': email, 'exp': expiration},
        JWT_SECRET_KEY,
        algorithm='HS256'
    )

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

# Google auth route
@app.route('/auth/google', methods=['POST'])
def google_auth():
    try:
        token = request.json.get('token')
        if not token:
            return jsonify({'error': 'No token provided'}), 400

        idinfo = id_token.verify_oauth2_token(token, requests.Request(), GOOGLE_CLIENT_ID)
        
        if idinfo['iss'] not in ['accounts.google.com', 'https://accounts.google.com']:
            return jsonify({'error': 'Wrong issuer'}), 401

        # Generate JWT
        jwt_token = create_token(idinfo['email'])

        return jsonify({
            'token': jwt_token,
            'user': {
                'email': idinfo['email'],
                'name': idinfo['name'],
                'picture': idinfo['picture']
            }
        }), 200
    
    except ValueError:
        return jsonify({'error': 'Invalid token'}), 401

# Utility functions
def cleanup_old_audio_files():
    """Remove audio files older than 1 hour"""
    try:
        current_time = time.time()
        for filename in os.listdir(TEMP_AUDIO_DIR):
            file_path = os.path.join(TEMP_AUDIO_DIR, filename)
            if os.path.getmtime(file_path) < current_time - 3600:  # 1 hour
                os.remove(file_path)
                logging.info(f"Removed old audio file: {filename}")
    except Exception as e:
        logging.error(f"Error cleaning up audio files: {e}")

def get_language_code(language):
    """Map language names to gTTS language codes"""
    language_map = {
        "english": "en",
        "tamil": "ta",
        "hindi": "hi",
        "telugu": "te"
    }
    return language_map.get(language.lower(), "en")

def extract_text_from_image(image_path):
    """Extract text from image using OCR"""
    try:
        img = Image.open(image_path)
        text = pytesseract.image_to_string(img)
        return text.strip()
    except Exception as e:
        logging.error(f"Error extracting text from image: {e}")
        return ""

def extract_text_from_pdf(pdf_path):
    """Extract text from PDF using PyPDF2"""
    try:
        text = ""
        with open(pdf_path, 'rb') as file:
            pdf_reader = PyPDF2.PdfReader(file)
            for page in pdf_reader.pages:
                text += page.extract_text() + "\n"
        return text.strip()
    except Exception as e:
        logging.error(f"Error extracting text from PDF: {e}")
        return ""

def process_uploaded_file(file_path):
    """Process uploaded file and extract text based on file type"""
    file_ext = file_path.rsplit('.', 1)[1].lower()
    
    if file_ext in ['png', 'jpg', 'jpeg']:
        return extract_text_from_image(file_path)
    elif file_ext == 'pdf':
        return extract_text_from_pdf(file_path)
    elif file_ext == 'txt':
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return f.read().strip()
        except UnicodeDecodeError:
            try:
                with open(file_path, 'r', encoding='latin-1') as f:
                    return f.read().strip()
            except Exception as e:
                logging.error(f"Error reading text file: {e}")
                return ""
    return ""

def generate_fallback_insights():
    """Generate fallback insights when the main generation fails."""
    return [
        {
            "type": "recommendation",
            "content": "Consider keeping track of your health questions and concerns in a journal.",
            "severity": "low"
        },
        {
            "type": "trend",
            "content": "Your interest in health information shows proactive health management.",
            "severity": "low"
        }
    ]

def generate_insights(insight_chat, conversation_summary, language):
    """Generate insights using the dedicated insight chat."""
    prompt = f"""Analyze this health conversation and return a JSON object with exactly 2 insights.
Format the response as below, including ONLY this JSON. Translate your insights to the following language: {language}:

{{
    "insights": [
        {{
            "type": "recommendation",
            "content": "specific actionable advice",
            "severity": "low"
        }},
        {{
            "type": "trend",
            "content": "observed pattern",
            "severity": "low"
        }}
    ]
}}

Conversation to analyze: {conversation_summary}"""
    
    try:
        response = insight_chat.send_message(prompt)
        response_text = response.text.strip()
        
        json_start = response_text.find('{')
        json_end = response_text.rfind('}') + 1
        
        if json_start >= 0 and json_end > json_start:
            json_str = response_text[json_start:json_end]
            insights = json.loads(json_str)
            
            if "insights" in insights and len(insights["insights"]) > 0:
                return insights["insights"]
        
        logging.warning("Could not parse insights response, using fallback")
        return generate_fallback_insights()
        
    except Exception as e:
        logging.error(f"Error generating insights: {str(e)}")
        return generate_fallback_insights()

def cleanup_sessions():
    """Remove sessions older than 24 hours and cleanup temp files."""
    while True:
        try:
            now = datetime.now(timezone.utc)
            expired_sessions = [
                sid for sid, data in sessions.items()
                if now - data['created_at'] > timedelta(hours=SESSION_EXPIRATION_HOURS)
            ]
            for sid in expired_sessions:
                del sessions[sid]
                logging.info(f"Session expired and removed: {sid}")
            
            cleanup_old_audio_files()
            
        except Exception as e:
            logging.error(f"Error during cleanup: {e}")
        time.sleep(3600)  # Check every hour

@app.route('/start_session', methods=['GET'])
@require_auth
def start_session():
    """Start a new chat session."""
    session_id = initialize_session()
    return jsonify({'session_id': session_id}), 200

# Modified chat route to incorporate RAG
@app.route('/chat/<session_id>', methods=['POST'])
@require_auth
def process_request(session_id):
    """Handle chat interactions with RAG-enhanced responses and streaming."""
    if session_id not in sessions:
        return jsonify({'error': 'Invalid session ID.'}), 400

    session_data = sessions[session_id]
    chat = session_data['chat']
    insight_chat = session_data['insight_chat']
    
    data = request.get_json()
    user_message = data.get('user_message', '').strip()
    language = data.get('language', 'English')
    user_email = data.get('email', '')  # Get user email from request

    if not user_message:
        initial_prompt = """Hello! I'm your healthcare assistant. I can help you with general health information and wellness advice. 
        Please note that I'm not a replacement for professional medical advice. How can I assist you today?"""
        session_data['chat_history'] = [{'role': 'bot', 'message': initial_prompt}]
        return jsonify({
            'bot_response': initial_prompt,
            'insights': generate_fallback_insights(),
            'is_first_message': True
        }), 200

    # Add to chat history
    session_data['chat_history'].append({'role': 'user', 'message': user_message})
    
    # Check if user message contains "old data" to determine whether to use RAG
    should_use_rag = "old data" in user_message.lower()
    
    # Initialize RAG manager if user email is provided and should use RAG
    rag_context = ""
    if user_email and should_use_rag:
        try:
            logging.info(f"User requested old data - using RAG for user {user_email}")
            rag_manager = RAGManager(user_email)
            # This automatically loads or updates the vector DB
            rag_context = rag_manager.get_context_for_prompt(user_message)
            if rag_context:
                logging.info(f"Found relevant context for query: {user_message[:30]}...")
            else:
                logging.info(f"No relevant context found for query: {user_message[:30]}...")
        except Exception as e:
            logging.error(f"Error using RAG: {str(e)}")
    
    # Enhance prompt with RAG context if available
    if rag_context:
        enhanced_message = f"""I'm going to answer a user's health-related question. First, here is some relevant context from their documents:

{rag_context}

Now, please respond to the user's question using the context above if relevant:
{user_message}

Remember to provide a direct answer that incorporates relevant information from their documents if applicable."""
    else:
        enhanced_message = user_message
    
    # Create streaming response using Ollama's stream feature
    def generate():
        # Prepare the messages for Ollama's chat API
        messages = []
        
        # Add system message if available
        if chat.system:
            messages.append({"role": "system", "content": chat.system})
        
        # Add conversation history
        for entry in chat.history:
            if entry["role"] == "user":
                messages.append({"role": "user", "content": entry["content"]})
            else:
                messages.append({"role": "assistant", "content": entry["content"]})
        
        # Add current message
        messages.append({"role": "user", "content": enhanced_message})
        
        # Make streaming API call to Ollama
        response = http_requests.post(
            f"{OLLAMA_API_URL}/chat",
            json={
                "model": chat.model,
                "messages": messages,
                "stream": True
            },
            stream=True
        )
        
        full_response = ""
        
        if response.status_code == 200:
            for line in response.iter_lines():
                if line:
                    try:
                        chunk = json.loads(line)
                        if "message" in chunk and "content" in chunk["message"]:
                            content = chunk["message"]["content"]
                            full_response += content
                            yield json.dumps({"chunk": content, "done": False}) + "\n"
                    except json.JSONDecodeError:
                        logging.error(f"Failed to parse JSON from stream: {line}")
            
            # Update the chat history with the full response
            chat.history.append({"role": "user", "content": enhanced_message})
            chat.history.append({"role": "assistant", "content": full_response})
            
            # Add to session history
            session_data['chat_history'].append({'role': 'bot', 'message': full_response})
            
            # Generate insights after the full response is collected
            recent_messages = session_data['chat_history'][-4:]
            conversation_summary = "\n".join([
                f"{'User' if msg['role'] == 'user' else 'Assistant'}: {msg['message']}"
                for msg in recent_messages
            ])
            
            try:
                insights = generate_insights(insight_chat, conversation_summary, language)
            except Exception as e:
                logging.error(f"Failed to generate insights: {str(e)}")
                insights = generate_fallback_insights()
            
            # Send the final message with insights and completion status
            yield json.dumps({
                "chunk": "",
                "done": True,
                "insights": insights,
                "is_first_message": False
            }) + "\n"
    
    return app.response_class(generate(), mimetype='application/json')


# Modified file processing route to incorporate RAG
@app.route('/process_file/<session_id>', methods=['POST'])
@require_auth
def process_file(session_id): 
    """Handle file upload, extract text, and stream LLM-based analysis without RAG."""
    if session_id not in sessions:
        return jsonify({'error': 'Invalid session ID.'}), 400

    if 'file' not in request.files:
        return jsonify({'error': 'No file provided.'}), 400

    file = request.files['file']
    language = request.form.get('language', 'english')
    username = request.form.get('user')

    if not username:
        return jsonify({'error': 'User email is required.'}), 400

    if file.filename == '':
        return jsonify({'error': 'No file selected.'}), 400

    if not allowed_file(file.filename):
        return jsonify({'error': 'File type not allowed.'}), 400

    # Set up folder structure
    PATIENT_DATA_DIR = os.path.join(os.getcwd(), "AAA")
    user_folder = os.path.join(PATIENT_DATA_DIR, username)
    formilvus_folder = os.path.join(user_folder, "formilvus")
    os.makedirs(user_folder, exist_ok=True)
    os.makedirs(formilvus_folder, exist_ok=True)

    try:
        filename = secure_filename(file.filename)
        unique_filename = f"{int(time.time())}_{filename}"
        file_path = os.path.join(user_folder, unique_filename)
        file.save(file_path)

        extracted_text = process_uploaded_file(file_path)
        if not extracted_text:
            return jsonify({'error': 'Failed to extract text from file or file is empty'}), 400

        extracted_text_filename = f"{os.path.splitext(filename)[0]}_{int(time.time())}.txt"
        extracted_text_path = os.path.join(formilvus_folder, extracted_text_filename)
        with open(extracted_text_path, "w", encoding="utf-8") as txtsave:
            txtsave.write(extracted_text)

        logging.info(f"Extracted and saved text from {filename} for user {username}")

        session_data = sessions[session_id]
        chat = session_data['chat']
        insight_chat = session_data['insight_chat']

        # Save file reference in history
        session_data['chat_history'].append({
            'role': 'user',
            'message': f"I've uploaded a document named {filename}. Can you analyze it for me?"
        })

        # Prepare summary prompt
        summary_prompt = f"""I've uploaded a document. Please:
1. Identify what type of medical document this is
2. Summarize key patient information and findings
3. Explain any medical terms in simple language
4. Highlight any areas that might need attention

Document content:
{extracted_text[:3000]}{"..." if len(extracted_text) > 3000 else ""}"""

        def generate():
            messages = []

            if chat.system:
                messages.append({"role": "system", "content": chat.system})

            for entry in chat.history:
                messages.append({
                    "role": entry["role"],
                    "content": entry["content"]
                })

            messages.append({"role": "user", "content": summary_prompt})

            response = http_requests.post(
                f"{OLLAMA_API_URL}/chat",
                json={
                    "model": chat.model,
                    "messages": messages,
                    "stream": True
                },
                stream=True
            )

            full_response = ""

            if response.status_code == 200:
                for line in response.iter_lines():
                    if line:
                        try:
                            chunk = json.loads(line)
                            if "message" in chunk and "content" in chunk["message"]:
                                content = chunk["message"]["content"]
                                full_response += content
                                yield json.dumps({"chunk": content, "done": False}) + "\n"
                        except json.JSONDecodeError:
                            logging.error(f"Failed to parse JSON from stream: {line}")

                chat.history.append({"role": "user", "content": summary_prompt})
                chat.history.append({"role": "assistant", "content": full_response})
                session_data['chat_history'].append({'role': 'bot', 'message': full_response})

                recent_messages = session_data['chat_history'][-4:]
                conversation_summary = "\n".join([
                    f"{'User' if msg['role'] == 'user' else 'Assistant'}: {msg['message']}"
                    for msg in recent_messages
                ])

                try:
                    insights = generate_insights(insight_chat, conversation_summary, language)
                except Exception as e:
                    logging.error(f"Failed to generate insights: {str(e)}")
                    insights = generate_fallback_insights()

                yield json.dumps({
                    "chunk": "",
                    "done": True,
                    "insights": insights,
                    "is_first_message": False,
                    "file_processed": True
                }) + "\n"
            else:
                logging.error("Streaming response failed from model API.")
                yield json.dumps({'error': 'Streaming failed from model API.'}) + "\n"

        return app.response_class(generate(), mimetype='application/json')

    except Exception as e:
        logging.error(f"Error processing file: {str(e)}")
        return jsonify({'error': f'Failed to process file: {str(e)}'}), 500
    

# New route to explicitly refresh the RAG index for a user
@app.route('/refresh_rag_index', methods=['POST'])
@require_auth
def refresh_rag_index():
    """Force refresh the RAG index for a specific user"""
    data = request.get_json()
    user_email = data.get('email', '')
    
    if not user_email:
        return jsonify({'error': 'User email is required'}), 400
    
    try:
        rag_manager = RAGManager(user_email)
        success = rag_manager.create_index()
        
        if success:
            return jsonify({'message': 'RAG index refreshed successfully'}), 200
        else:
            return jsonify({'message': 'No documents found for indexing'}), 200
    
    except Exception as e:
        logging.error(f"Error refreshing RAG index: {str(e)}")
        return jsonify({'error': 'Failed to refresh RAG index'}), 500

@app.route('/tts', methods=['POST'])
def text_to_speech():
    """Convert text to speech and return audio file"""
    try:
        data = request.get_json()
        text = data.get('text', '')
        language = data.get('language', 'english')
        
        if not text:
            return jsonify({'error': 'No text provided'}), 400

        cleanup_old_audio_files()
        
        filename = f"speech_{uuid.uuid4()}.mp3"
        filepath = os.path.join(TEMP_AUDIO_DIR, filename)
        
        tts = gTTS(text=text, lang=get_language_code(language), slow=False)
        tts.save(filepath)
        
        return send_file(
            filepath,
            mimetype='audio/mpeg',
            as_attachment=True,
            download_name=filename
        )
    
    except Exception as e:
        logging.error(f"TTS Error: {str(e)}")
        return jsonify({'error': 'Failed to generate speech'}), 500

def cleanup_on_shutdown():
    """Remove temporary directories on application shutdown"""
    try:
        shutil.rmtree(TEMP_AUDIO_DIR)
        shutil.rmtree(TEMP_UPLOAD_DIR)
        logging.info("Temporary directories removed")
    except Exception as e:
        logging.error(f"Error cleaning up temporary directories: {e}")

import atexit
atexit.register(cleanup_on_shutdown)

# Start cleanup thread
cleanup_thread = Thread(target=cleanup_sessions, daemon=True)
cleanup_thread.start()

if __name__ == '__main__':
    app.run(debug=True, port=4000)