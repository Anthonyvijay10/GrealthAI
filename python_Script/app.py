from waitress import serve
from ollamatry import app  # make sure `ollamatry.py` has a Flask `app` object

serve(app, host='0.0.0.0', port=4000)
