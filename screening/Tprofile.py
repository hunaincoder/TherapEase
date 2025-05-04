from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import google.generativeai as genai
import os
import json
import re

# Initialize app
app = FastAPI()

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Gemini API setup
os.environ['GOOGLE_API_KEY'] = "AIzaSyBbOvOEPYa8YhDoVwnTWjFeqPfjLCohvA0"
genai.configure(api_key=os.environ['GOOGLE_API_KEY'])

# Pydantic model


class ProfileData(BaseModel):
    q1: str
    q2: str
    q3: str
    q4: str
    q5: str

# Main API route


@app.post("/generate-summary")
async def generate_summary(profile_data: ProfileData = Body(...)):
    try:
        prompt = f"""
You are a professional therapy assistant. Analyze the following therapy profile responses and return ONLY a valid JSON object, without any extra text, explanations, or formatting.

1. Primary Concern and Impact:
{profile_data.q1}

2. Relevant Past Experiences:
{profile_data.q2}

3. Current Emotional State and Behavior Patterns:
{profile_data.q3}

4. Therapy History and Support System:
{profile_data.q4}

5. Therapy Goals and Preferences:
{profile_data.q5}

Return JSON object with this structure:
{{
  "primary_concern": "...",
  "impact": "...",
  "past_experiences": "...",
  "emotional_state": "...",
  "behavior_patterns": "...",
  "therapy_history": "...",
  "support_system": "...",
  "therapy_goals": "...",
  "therapist_preferences": "..."
}}
"""

        model = genai.GenerativeModel("gemini-1.5-pro")
        response = model.generate_content(prompt)

        # Debug print to inspect Gemini output
        print("Raw Gemini response:\n", response.text)

        # Extract JSON block
        json_match = re.search(r"\{[\s\S]*\}", response.text)
        if not json_match:
            raise HTTPException(
                status_code=500, detail="No valid JSON object found in response."
            )

        response_text = json_match.group().strip()

        # Remove markdown code block formatting if present
        if response_text.startswith("```json"):
            response_text = response_text[len("```json"):].strip()
        if response_text.endswith("```"):
            response_text = response_text[:-3].strip()

        # Load JSON
        parsed = json.loads(response_text)

        return {
            "status": "success",
            "message": "Profile summary generated",
            "summary": parsed
        }

    except json.JSONDecodeError as json_err:
        raise HTTPException(
            status_code=500,
            detail=f"JSON parsing failed: {str(json_err)}. Raw response: {response_text}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Unhandled exception: {str(e)}"
        )
