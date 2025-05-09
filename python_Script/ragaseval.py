from ragas import evaluate
from ragas.metrics import answer_relevancy, faithfulness  # Remove context_precision, context_recall
from datasets import Dataset

# Sample dataset (you can expand this for multiple questions)
sample_data = [
    {
        "question": "How does hypertension affect kidney function?",
        "contexts": [
            "Hypertension can damage kidney blood vessels.",
            "Long-term high blood pressure leads to chronic kidney disease.",
            "The kidneys filter waste and regulate blood pressure."
        ],
        "gemma_answer": "Hypertension affects the body and makes you feel tired, including kidney problems.",
        "llama_answer": "High blood pressure harms kidney vessels, causing them to stop working over time."
    }
]

# Prepare data for both models
gemma_dataset = Dataset.from_list([
    {
        "question": entry["question"],
        "contexts": entry["contexts"],
        "answer": entry["gemma_answer"]
    } for entry in sample_data
])

llama_dataset = Dataset.from_list([
    {
        "question": entry["question"],
        "contexts": entry["contexts"],
        "answer": entry["llama_answer"]
    } for entry in sample_data
])

# Choose only RAGAS metrics that do not require reference (removing context_precision, context_recall)
metrics = [answer_relevancy, faithfulness]

# Evaluate Gemma
print("🔹 Evaluating Gemma 2 (1.1B)...")
gemma_scores = evaluate(gemma_dataset, metrics=metrics)
print(gemma_scores)

# Evaluate LLaMA
print("\n🔸 Evaluating LLaMA 3 (1B)...")
llama_scores = evaluate(llama_dataset, metrics=metrics)
print(llama_scores)
