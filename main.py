from flask import Flask
from flask_cors import CORS
from routes import auth_routes, chat_routes, file_routes, rag_routes, tts_routes
from utils.session import cleanup_sessions
from utils.audio_ops import cleanup_on_shutdown
import threading
import atexit

app = Flask(__name__)
CORS(app, supports_credentials=True)
app.secret_key = b'super-secret-key'

# Register Blueprints
app.register_blueprint(auth_routes.bp)
app.register_blueprint(chat_routes.bp)
app.register_blueprint(file_routes.bp)
app.register_blueprint(rag_routes.bp)
app.register_blueprint(tts_routes.bp)

# Background tasks
threading.Thread(target=cleanup_sessions, daemon=True).start()
atexit.register(cleanup_on_shutdown)

if __name__ == '__main__':
    app.run(debug=True, port=4000)