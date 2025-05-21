import requests
import logging
from config import OLLAMA_API_URL

class OllamaChat:
    def __init__(self, model, system_instruction=""):
        self.model = model
        self.system = system_instruction
        self.history = []

    def start_chat(self, history=None):
        self.history = history or []
        return self

    def send_message(self, message):
        messages = []
        if self.system:
            messages.append({"role": "system", "content": self.system})
        for entry in self.history:
            messages.append({"role": entry["role"], "content": entry["content"]})
        messages.append({"role": "user", "content": message})

        response = requests.post(
            f"{OLLAMA_API_URL}/chat",
            json={"model": self.model, "messages": messages, "stream": False}
        )

        if response.status_code != 200:
            logging.error(f"Ollama API error: {response.text}")
            raise Exception(f"Ollama API returned status {response.status_code}")

        content = response.json()["message"]["content"]
        self.history.append({"role": "user", "content": message})
        self.history.append({"role": "assistant", "content": content})

        class ResponseObj:
            def __init__(self, text):
                self.text = text

        return ResponseObj(content)