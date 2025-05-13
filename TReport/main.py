# main.py
from fastapi import Body
import datetime
from typing import Union, Dict, Any
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import os
import tempfile
from dotenv import load_dotenv
import google.generativeai as genai
from diarization_prompt import DIARIZATION_PROMPT
from after_therapy_prompt import AFTER_THERAPY_REPORT_PROMPT
from helpers import parse_diarization_result, convert_diarization_result_to_string, group_diarization_result_by_speaker
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorClient

from pymongo import MongoClient


load_dotenv()
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/")
client = MongoClient(MONGO_URI)
db = client["test"]
collection = db["after_therapy_reports"]


app = FastAPI(title="Gemini Audio Diarization API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
def read_root():
    return FileResponse("static/upload.html")


# Configure the GenAI client
genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))
MODEL_NAME = "gemini-1.5-pro-latest"  # Updated to a more recent model


@app.post("/diarize")
async def diarize_audio(file: UploadFile = File(...)):
    try:
        if not file.filename.lower().endswith('.mp3'):
            raise HTTPException(
                status_code=400, detail="Only MP3 files are supported")

        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as tmp:
            tmp.write(await file.read())
            tmp_path = tmp.name

        uploaded_file = genai.upload_file(path=tmp_path)
        model = genai.GenerativeModel(model_name=MODEL_NAME)
        response = model.generate_content([DIARIZATION_PROMPT, uploaded_file])
        os.remove(tmp_path)

        diarization_result = parse_diarization_result(response.text)
        diarization_result_by_speaker = group_diarization_result_by_speaker(
            diarization_result)
        result_string = convert_diarization_result_to_string(
            diarization_result_by_speaker)
        return {"result": result_string}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class DiarizationResult(BaseModel):
    diarization_result: str


@app.post("/generate_report")
async def generate_after_therapy_report(data: DiarizationResult):
    try:
        model = genai.GenerativeModel(model_name=MODEL_NAME)
        response = model.generate_content(
            [AFTER_THERAPY_REPORT_PROMPT, data.diarization_result])
        return {"report": response.text.strip()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class ReportData(BaseModel):
    report: Union[Dict[str, Any], str]
    appointmentId: str

@app.post("/save_report")
async def save_report(data: ReportData):
    """
    Save a therapy session report to the database.
    The report can be either a string or a dictionary.
    """
    try:
        if not data.appointmentId:
            raise HTTPException(
                status_code=400, detail="Appointment ID is required")
        
        report_data = {}
        
        if isinstance(data.report, str):
            report_data["report_text"] = data.report
        else:
            report_data = data.report
        
        report_data["sessionId"] = data.appointmentId
        report_data["createdAt"] = datetime.datetime.now()
        
        result = collection.insert_one(report_data)
        return {"message": "Report saved", "id": str(result.inserted_id)}
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error saving report: {str(e)}")