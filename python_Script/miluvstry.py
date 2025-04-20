import os
import uuid
import time
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from datetime import datetime, timedelta, timezone
from threading import Thread
import google.generativeai as genai
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

# Load environment variables
load_dotenv()

# Configure Flask App
app = Flask(__name__)
CORS(app)
app.secret_key = os.urandom(24)

# Configure Logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

# Configure Generative AI Model
genai_api_key = os.getenv("GENAI_API_KEY")
if not genai_api_key:
    raise ValueError("Missing GENAI_API_KEY. Set it in your .env file.")
genai.configure(api_key=genai_api_key)

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")

# Create temporary directories
TEMP_AUDIO_DIR = os.path.join(tempfile.gettempdir(), 'health_assistant_audio')
TEMP_UPLOAD_DIR = os.path.join(tempfile.gettempdir(), 'health_assistant_uploads')
os.makedirs(TEMP_AUDIO_DIR, exist_ok=True)
os.makedirs(TEMP_UPLOAD_DIR, exist_ok=True)

# Global session store
sessions = {}
SESSION_EXPIRATION_HOURS = 24

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'pdf', 'txt'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def initialize_session():
    """Initialize a new session with separate chat and insight histories."""
    session_id = str(uuid.uuid4())
    
    # Chat system instruction
    chat_instruction = """You are a healthcare assistant. Your role is to:
    1. Provide general health information and guidance.
    2. Help users understand common medical terms and conditions.
    3. Suggest when to seek professional medical help.
    4. Offer wellness and preventive health advice.
    5. You know all languages, so give advices in those languages.
    6. Always answer the health related questions asked, never ask to ask a doctor
    
    Important: Always include a disclaimer that you're not a replacement for professional medical advice at the end."""
    
    # Insight system instruction
    insight_instruction = """You are an analytical health insight generator. Your role is to:
    1. Analyze health conversations and identify key patterns
    2. Generate relevant health insights and recommendations
    3. Assess potential health risks and trends
    4. Provide actionable health guidance"""
    
    # Initialize both chat models
    chat = genai.GenerativeModel("gemini-1.5-flash", system_instruction=chat_instruction).start_chat(history=[])
    insight_chat = genai.GenerativeModel("gemini-1.5-flash", system_instruction=insight_instruction).start_chat(history=[])
    
    sessions[session_id] = {
        'chat': chat,
        'insight_chat': insight_chat,
        'chat_history': [],
        'insight_history': [],
        'created_at': datetime.now(timezone.utc),
        # 'user_email': None  # Add this line
    }
    
    
    logging.info(f"New session initialized: {session_id}")
    return session_id


# Add these new functions for authentication
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

# Add these new routes for Google authentication
@app.route('/auth/google', methods=['POST'])
def google_auth():
    #  try:
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
    
    # except ValueError:
    #     return jsonify({'error': 'Invalid token'}), 401

# google end

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

@app.route('/chat/<session_id>', methods=['POST'])
@require_auth
def process_request(session_id):
    """Handle chat interactions with separate insight generation."""
    if session_id not in sessions:
        return jsonify({'error': 'Invalid session ID.'}), 400

    session_data = sessions[session_id]
    chat = session_data['chat']
    insight_chat = session_data['insight_chat']
    
    data = request.get_json()
    user_message = data.get('user_message', '').strip()
    language = data.get('language', 'English')

    if not user_message:
        initial_prompt = """Hello! I'm your healthcare assistant. I can help you with general health information and wellness advice. 
        Please note that I'm not a replacement for professional medical advice. How can I assist you today?"""
        session_data['chat_history'] = [{'role': 'bot', 'message': initial_prompt}]
        return jsonify({
            'bot_response': initial_prompt,
            'insights': generate_fallback_insights(),
            'is_first_message': True
        }), 200

    session_data['chat_history'].append({'role': 'user', 'message': user_message})
    
    response = chat.send_message(user_message)
    bot_response = response.text.strip()
    
    session_data['chat_history'].append({'role': 'bot', 'message': bot_response})
    
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
    
    return jsonify({
        'bot_response': bot_response,
        'insights': insights,
        'is_first_message': False
    }), 200

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

@app.route('/process_file/<session_id>', methods=['POST'])
@require_auth
def process_file(session_id): 
    """Handle file upload, store it in user-specific folder, and process it"""
    if session_id not in sessions:
        return jsonify({'error': 'Invalid session ID.'}), 400
    
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided.'}), 400
    
    file = request.files['file']
    language = request.form.get('language', 'english')
    username = request.form.get('user')

    if file.filename == '':
        return jsonify({'error': 'No file selected.'}), 400
    
    if not allowed_file(file.filename):
        return jsonify({'error': 'File type not allowed.'}), 400

    # Create user folder and "formilvus" subfolder
    PATIENT_DATA_DIR = os.path.join(os.getcwd(), "AAA")
    user_folder = os.path.join(PATIENT_DATA_DIR, username)
    formilvus_folder = os.path.join(user_folder, "formilvus")

    os.makedirs(user_folder, exist_ok=True)
    os.makedirs(formilvus_folder, exist_ok=True)

    try:
        # Save file inside user's folder
        filename = secure_filename(file.filename)
        unique_filename = f"{uuid.uuid4()}_{filename}"
        file_path = os.path.join(user_folder, unique_filename)
        file.save(file_path)  # Saves the uploaded file

        # Extract text from the uploaded file
        extracted_text = process_uploaded_file(file_path)

        if not extracted_text:  # Check if extraction failed
            return jsonify({'error': 'Failed to extract text'}), 500

        # Save extracted text inside "formilvus" folder
        extracted_text_filename = os.path.splitext(unique_filename)[0] + ".txt"
        extracted_text_path = os.path.join(formilvus_folder, extracted_text_filename)

        with open(extracted_text_path, "w", encoding="utf-8") as txtsave:
            txtsave.write(extracted_text)
        
        if not extracted_text:
            return jsonify({'error': 'Could not extract text from file.'}), 400
        
        summary_prompt = f"""Please analyze this text and provide a clear, concise response addressing any health-related concerns or information found in it. If the text is very long, focus on the most important health-related points:{extracted_text}"""
        
        session_data = sessions[session_id]
        chat = session_data['chat']
        insight_chat = session_data['insight_chat']

        chat = session_data['chat']
        insight_chat = session_data['insight_chat']
        
        session_data['chat_history'].append({
            'role': 'user',
            'message': f"Content from uploaded file {filename}:\n{extracted_text[:500]}..." if len(extracted_text) > 500 else extracted_text
        })
        
        response = chat.send_message(summary_prompt)
        bot_response = response.text.strip()
        
        session_data['chat_history'].append({'role': 'bot', 'message': bot_response})
        
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
        
        return jsonify({
            'bot_response': bot_response,
            'insights': insights,
            'is_first_message': False
        }), 200

    except Exception as e:
        logging.error(f"Error processing file: {str(e)}")
        return jsonify({'error': 'Failed to process file.'}), 500


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