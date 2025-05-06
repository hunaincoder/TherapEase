"""
    This is a FastAPI application that provides a RESTful API for diarizing audio files.
    It allows users to upload audio files and receive diarized results in JSON format.

    The application uses the following technologies:
    - FastAPI: A modern, fast (high-performance), web framework for building APIs.
    - httpx: An HTTP client for Python that supports both synchronous and asynchronous operations.
    - dotenv: A Python library for loading environment variables from a .env file.
    - google.generativeai: A Python client for the Google Generative AI API.
    - tempfile: A Python library for creating temporary files and directories.
"""
import os
import tempfile
from dotenv import load_dotenv
import google.generativeai as genai
from fastapi import FastAPI, UploadFile, File, HTTPException
from diarization_prompt import DIARIZATION_PROMPT
from helpers import parse_diarization_result, convert_diarization_result_to_string, \
    group_diarization_result_by_speaker

load_dotenv()

app = FastAPI(title="Gemini Audio Diarization API")

# Configure the GenAI client
genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))

# Define the Gemini model to use
MODEL_NAME = "gemini-2.0-flash-001"


@app.post("/diarize", response_model=str)
async def diarize_audio(file: UploadFile = File(...)) -> str:
    """
    Diarizes an audio file and returns the result.

    Args:
        file: The audio file to diarize.

    Returns:
        A string of the diarization result.
    """
    try:
        # Save the uploaded file to a temporary location
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as tmp:
            tmp.write(await file.read())
            tmp_path = tmp.name
        # Upload the audio file to Gemini
        uploaded_file = genai.upload_file(path=tmp_path)
        # Initialize the Gemini model
        model = genai.GenerativeModel(model_name=MODEL_NAME)
        # Send the prompt and audio file to the model
        response = model.generate_content([DIARIZATION_PROMPT, uploaded_file])
        # Clean up the temporary file
        os.remove(tmp_path)
        diatization_result = parse_diarization_result(response.text)
        diatization_result_by_speaker = group_diarization_result_by_speaker(diatization_result)
        diatization_result_string = convert_diarization_result_to_string(diatization_result_by_speaker)
        # Return the diatization result
        return diatization_result_string
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
