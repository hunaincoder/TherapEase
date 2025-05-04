import os
from fastapi import FastAPI, UploadFile, File, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import pdfplumber
import google.generativeai as genai
import json
import re
from io import BytesIO
from pymongo import MongoClient
from datetime import datetime
import logging
from bson import ObjectId
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

os.environ['GOOGLE_API_KEY'] = "AIzaSyBbOvOEPYa8YhDoVwnTWjFeqPfjLCohvA0"
genai.configure(api_key=os.environ['GOOGLE_API_KEY'])

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/")
DATABASE_NAME = "test"
COLLECTION_NAME = "therapists"

try:
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    client.server_info()
    db = client[DATABASE_NAME]
    therapist_collection = db[COLLECTION_NAME]
    logger.info("Successfully connected to MongoDB")
except Exception as e:
    logger.error(f"MongoDB connection error: {e}")
    raise RuntimeError("Failed to connect to MongoDB")



def extract_text_from_pdf(pdf_bytes):
    try:
        with pdfplumber.open(BytesIO(pdf_bytes)) as pdf:
            text = "\n".join([page.extract_text()
                             for page in pdf.pages if page.extract_text()])
            if not text:
                raise ValueError("No text could be extracted from PDF")
            return text
    except Exception as e:
        logger.error(f"PDF extraction error: {e}")
        raise HTTPException(
            status_code=400, detail=f"Error processing PDF: {str(e)}")



def ner_prompt(cv_text):
    return f"""
    Extract the following details from this CV and return in JSON format:
    {{
      "First Name": "",
      "Last Name": "",
      "Email": "",
      "Phone Number": "",
      "Address": "",
      "Education": [
        {{ "Degree": "", "Institution": "", "Year": "" }}
      ],
      "Certifications": [],
      "Awards": [],
      "Specialization": [],
      "Thesis": "",
      "Work Experience": [
        {{ "Job Title": "", "Company": "", "Start Date": "", "End Date": "" }}
      ],
      "Skills": []
    }}

    CV Text:
    {cv_text}
    """



@app.post("/upload-cv/")
async def upload_cv(file: UploadFile = File(...)):
    try:
        logger.info("Received CV upload request")
        pdf_bytes = await file.read()
        text = extract_text_from_pdf(pdf_bytes)

        model = genai.GenerativeModel("gemini-1.5-pro")
        response = model.generate_content(ner_prompt(text))

        try:
            cleaned = re.sub(r"```json\s*|\s*```", "", response.text).strip()
            data = json.loads(cleaned)
            logger.info("Successfully parsed CV data")
            return data
        except json.JSONDecodeError as e:
            logger.error(
                f"Failed to parse Gemini response: {e}\nResponse: {response.text}")
            raise HTTPException(
                status_code=500, detail="Failed to parse AI response")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in upload_cv: {e}")
        raise HTTPException(status_code=500, detail=str(e))



@app.post("/submit-cv/")
async def submit_cv(request: Request):
    try:
        form_data = await request.form()
        logger.info(f"Received form data: {dict(form_data)}")

        therapist_id = form_data.get("therapist_id")
        if not therapist_id:
            raise HTTPException(
                status_code=400, detail="Therapist ID is required")

        address = form_data.get("address", "")
        address_parts = address.split(",") if address else []
        city = address_parts[0].strip() if address_parts else ""
        state = address_parts[-1].strip() if len(address_parts) > 1 else ""

        work_experience = json.loads(form_data.get("work_experience", "[]"))
        for exp in work_experience:
            if exp["End Date"] and exp["End Date"].strip().lower() == "present":
                exp["End Date"] = "2025-01-01"

        therapist_data = {
            "firstName": form_data.get("first_name", ""),
            "lastName": form_data.get("last_name", ""),
            "email": form_data.get("email", ""),
            "phone": form_data.get("phone", ""),
            "city": city,
            "state": state,
            "bio": form_data.get("thesis", ""),
            "services": [skill.strip() for skill in form_data.get("skills", "").split(",") if skill.strip()],
            "specialties": [spec.strip() for spec in form_data.get("specialization", "").split(",") if spec.strip()],
            "education": [
                {
                    "degree": edu["Degree"],
                    "college": edu["Institution"],
                    "yearOfCompletion": edu["Year"]
                }
                for edu in json.loads(form_data.get("education", "[]"))
            ],
            "experience": [
                {
                    "clinicExperience": exp["Company"],
                    "from": exp["Start Date"] if exp["Start Date"] else None,
                    "to": exp["End Date"] if exp["End Date"] else None,
                    "designation": exp["Job Title"]
                }
                for exp in work_experience
            ],
            "awards": [
                {"name": award.strip()}
                for award in form_data.get("awards", "").split(",") if award.strip()
            ],
            "certifications": [cert.strip() for cert in form_data.get("certifications", "").split(",") if cert.strip()],
            "badge": int(form_data.get("badge_level", 1)),
            "updatedAt": datetime.now(),
            "status": "Pending"
        }

        try:
            result = therapist_collection.update_one(
                {"_id": ObjectId(therapist_id)},
                {"$set": therapist_data},
                upsert=False
            )
            if result.matched_count == 0:
                raise HTTPException(
                    status_code=404, detail="Therapist not found")
            logger.info(
                f"Successfully updated therapist with ID: {therapist_id}")
            return {
                "message": "Therapist profile updated successfully! Awaiting admin approval.",
                "therapist_id": therapist_id
            }
        except Exception as db_error:
            logger.error(f"Database error: {db_error}")
            raise HTTPException(
                status_code=500, detail=f"Database error: {db_error}")

    except json.JSONDecodeError as e:
        logger.error(f"JSON decode error: {e}")
        raise HTTPException(
            status_code=400, detail=f"Invalid JSON data: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in submit_cv: {e}")
        raise HTTPException(status_code=500, detail=str(e))



@app.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}



@app.get("/test-db")
async def test_db():
    try:
        client.admin.command('ping')
        return {"status": "success", "message": "MongoDB connection working"}
    except Exception as e:
        return {"status": "error", "message": str(e)}
