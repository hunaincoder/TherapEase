import json
from fastapi import FastAPI, Body, HTTPException
import google.generativeai as genai
import os
import re
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

# uvicorn main:app --port 8001 --reload
# Set API Key
os.environ['GOOGLE_API_KEY'] = "AIzaSyBbOvOEPYa8YhDoVwnTWjFeqPfjLCohvA0"
genai.configure(api_key=os.environ['GOOGLE_API_KEY'])

# Load JSON files
with open("data.json", "r") as file:
    data = json.load(file)

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
# Mount static files (for serving HTML)
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
async def read_root():
    return FileResponse('static/index.html')


@app.get("/questions")
async def get_questions():
    with open("questions.json", "r") as file:
        return json.load(file)


@app.post("/get-specific-questions/")
async def get_specific_questions(top_scales: dict = Body(...)):

    try:
        # Validate input
        if not top_scales.get("top_3"):
            return JSONResponse(
                status_code=400,
                content={"message": "Missing 'top_3' in request body"}
            )

        if not isinstance(top_scales["top_3"], list):
            return JSONResponse(
                status_code=400,
                content={"message": "'top_3' should be an array"}
            )

        with open("specific.json", "r") as file:
            specific_questions = json.load(file)

        # Get questions for the top 3 scales with validation
        result = {}
        for scale in top_scales["top_3"]:
            if not isinstance(scale, dict):
                continue

            scale_name = scale.get("scale")
            if scale_name and scale_name in specific_questions:
                result[scale_name] = specific_questions[scale_name]

        if not result:
            return JSONResponse(
                status_code=404,
                content={"message": "No questions found for the provided scales"}
            )

        return result

    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"message": f"Error loading specific questions: {str(e)}"}
        )


@app.post("/recommend-scale/")
async def recommend_scale(user_answers: dict = Body(...)):
    # Format user answers for the prompt
    answers_text = "\n".join(
        [f"Q: {q}\nA: {a}" for q, a in user_answers.items()])

    anxiety_samples = ""
    for question, answers in data['sample_answers']['anxiety'].items():
        anxiety_samples += f"\nQ: {question}"
        for i, answer in enumerate(answers, start=1):
            anxiety_samples += f"\nSample {i}: {answer}"

    depression_samples = ""
    for question, answers in data['sample_answers']['depression'].items():
        depression_samples += f"\nQ: {question}"
        for i, answer in enumerate(answers, start=1):
            depression_samples += f"\nSample {i}: {answer}"

    Stress_samples = ""
    for question, answers in data['sample_answers']['Stress'].items():
        Stress_samples += f"\nQ: {question}"
        for i, answer in enumerate(answers, start=1):
            Stress_samples += f"\nSample {i}: {answer}"

    BodyImage_samples = ""
    for question, answers in data['sample_answers']['BodyImage'].items():
        BodyImage_samples += f"\nQ: {question}"
        for i, answer in enumerate(answers, start=1):
            BodyImage_samples += f"\nSample {i}: {answer}"

    PTSD_samples = ""
    for question, answers in data['sample_answers']['PTSD'].items():
        PTSD_samples += f"\nQ: {question}"
        for i, answer in enumerate(answers, start=1):
            PTSD_samples += f"\nSample {i}: {answer}"

    AlcoholUse_samples = ""
    for question, answers in data['sample_answers']['AlcoholUse'].items():
        AlcoholUse_samples += f"\nQ: {question}"
        for i, answer in enumerate(answers, start=1):
            AlcoholUse_samples += f"\nSample {i}: {answer}"
    DrugUse_samples = ""
    for question, answers in data['sample_answers']['DrugUse'].items():
        DrugUse_samples += f"\nQ: {question}"
        for i, answer in enumerate(answers, start=1):
            DrugUse_samples += f"\nSample {i}: {answer}"

    GriefandLoss_samples = ""
    for question, answers in data['sample_answers']['GriefandLoss'].items():
        GriefandLoss_samples += f"\nQ: {question}"
        for i, answer in enumerate(answers, start=1):
            GriefandLoss_samples += f"\nSample {i}: {answer}"
    IdentityCrisis_samples = ""
    for question, answers in data['sample_answers']['IdentityCrisis'].items():
        IdentityCrisis_samples += f"\nQ: {question}"
        for i, answer in enumerate(answers, start=1):
            IdentityCrisis_samples += f"\nSample {i}: {answer}"

    OCD_samples = ""
    for question, answers in data['sample_answers']['OCD'].items():
        OCD_samples += f"\nQ: {question}"
        for i, answer in enumerate(answers, start=1):
            OCD_samples += f"\nSample {i}: {answer}"
    SelfEsteem_samples = ""
    for question, answers in data['sample_answers']['SelfEsteem'].items():
        SelfEsteem_samples += f"\nQ: {question}"
        for i, answer in enumerate(answers, start=1):
            SelfEsteem_samples += f"\nSample {i}: {answer}"

    SleepdisorderInsomnia_samples = ""
    for question, answers in data['sample_answers']['SleepdisorderInsomnia'].items():
        SleepdisorderInsomnia_samples += f"\nQ: {question}"
        for i, answer in enumerate(answers, start=1):
            SleepdisorderInsomnia_samples += f"\nSample {i}: {answer}"
    SleepDisorder_samples = ""
    for question, answers in data['sample_answers']['SleepDisorder'].items():
        SleepDisorder_samples += f"\nQ: {question}"
        for i, answer in enumerate(answers, start=1):
            SleepDisorder_samples += f"\nSample {i}: {answer}"

    SocialAnxiety_samples = ""
    for question, answers in data['sample_answers']['SocialAnxiety'].items():
        SocialAnxiety_samples += f"\nQ: {question}"
        for i, answer in enumerate(answers, start=1):
            SocialAnxiety_samples += f"\nSample {i}: {answer}"

    # Create prompt with specific keywords guidance
    prompt = f"""
Based on the following user's answers to a mental health screening,
analyze and rank the top 3 most relevant psychotherapy scales from this list:

Important: Use the full scale name including its abbreviation exactly as shown below — do NOT return partial names or abbreviations alone:
- Anxiety (GAD-7)
- Body Image (BSQ) 
- Depression (PHQ 9)
- PTSD (PCL-5)
- Alcohol Use (AUDIT)
- Drug Use (DAST-10)
- Grief and Loss (ICG)
- Identity Crisis (SCS)
- OCD (OCI-R)
- Self-Esteem (Rosenberg Self-Esteem Scale)
- Sleep disorder (ESS)
- Sleep Disorder Insomnia (ISI)
- Social Anxiety (LSAS)
- Stress (PSS)

Return only the full names from this list.

**Scoring Rules:**
1. Assign a confidence score (0-100%) for each scale based on keyword matches.
2. Higher score = Stronger match with user's answers.
3. If **all confidence scores are below 40%**, do not return any scales. Instead, return the following JSON exactly:
{{
  "recommendation": "General Counselor"
}}

Otherwise, return the **top 3 highest-scoring scales** in strict JSON format (no extra text).

Keywords for guidance:
- Depression: {', '.join(data['keywords']['depression'])}
- Anxiety: {', '.join(data['keywords']['anxiety'])}
- PTSD: {', '.join(data['keywords']['ptsd'])}

Sample answers for guidance:
- Anxiety:
{anxiety_samples}

- BodyImage:
{BodyImage_samples}

- PTSD:
{PTSD_samples}

- AlcoholUse:
{AlcoholUse_samples}

- DrugUse:
{DrugUse_samples}

- GriefandLoss:
{GriefandLoss_samples}

- IdentityCrisis:
{IdentityCrisis_samples}

- OCD:
{OCD_samples}

- SelfEsteem:
{SelfEsteem_samples}

- SleepdisorderInsomnia:
{SleepdisorderInsomnia_samples}

- SleepDisorder:
{SleepDisorder_samples}

- SocialAnxiety:
{SocialAnxiety_samples}

- Depression:
{depression_samples}

User's answers to the screening questions:
{answers_text}

**Important Response Guidelines:**
1. You MUST respond with ONLY the JSON format specified below
2. Do NOT include any additional text, explanations, or markdown symbols
3. If using markdown, ONLY use ```json ``` to wrap the JSON
4. Ensure all brackets and quotes are properly closed

**Output Format (Strict JSON, no extra text):**
{{
  "top_3": [
    {{"scale": "ScaleName", "confidence": "X%"}},
    {{"scale": "ScaleName", "confidence": "X%"}},
    {{"scale": "ScaleName", "confidence": "X%"}}
  ]
}}
    """

    model = genai.GenerativeModel("gemini-1.5-pro")
    response = model.generate_content(prompt)

    try:
        # First try to parse as pure JSON
        response_json = json.loads(response.text.strip())
        return response_json
    except json.JSONDecodeError:
        # If not pure JSON, try to extract JSON from markdown
        try:
            # Look for JSON in markdown code blocks
            json_match = re.search(
                r'```json\n(.*?)\n```', response.text, re.DOTALL)
            if json_match:
                return json.loads(json_match.group(1).strip())

            # Look for plain JSON without code blocks
            json_match = re.search(r'\{.*\}', response.text, re.DOTALL)
            if json_match:
                return json.loads(json_match.group(0).strip())

            if "General Counselor" in response.text:
                return {"recommendation": "General Counselor"}

            return {
                "error": "Could not parse response",
                "raw_response": response.text,
                "message": "The API response didn't contain valid JSON. Please check the prompt formatting."
            }
        except Exception as e:
            return {
                "error": "Parse error",
                "exception": str(e),
                "raw_response": response.text
            }


@app.post("/determine-final-scale/")
async def determine_final_scale(data: dict = Body(...)):
    try:
        # Validate input data
        if not data.get("answers") or not data.get("topScales"):
            raise HTTPException(
                status_code=400,
                detail="Missing required fields: answers or topScales"
            )
        if not isinstance(data["topScales"], list) or not all(
            isinstance(scale, dict) and "scale" in scale for scale in data["topScales"]
        ):
            raise HTTPException(
                status_code=400,
                detail="Invalid format for topScales: must be a list of objects with 'scale' key"
            )

        # Format answers for the prompt
        answers_text = ""
        for scale, questions in data["answers"].items():
            answers_text += f"\n\n{scale} Questions:"
            for q in questions:
                if not isinstance(q, dict) or "question" not in q or "answer" not in q:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Invalid question format for scale {scale}"
                    )
                answers_text += f"\nQ: {q['question']}\nA: {q['answer']}"

        prompt = f"""
Based on the user's detailed answers to follow-up questions for these scales:
{', '.join([s['scale'] for s in data['topScales']])}

Analyze the responses and determine which single scale is most appropriate. The scale must be one of the following:
- Anxiety (GAD-7)
- Body Image (BSQ)
- Depression (PHQ 9)
- PTSD (PCL-5)
- Alcohol Use (AUDIT)
- Drug Use (DAST-10)
- Grief and Loss (ICG)
- Identity Crisis (SCS)
- OCD (OCI-R)
- Self-Esteem (Rosenberg Self-Esteem Scale)
- Sleep disorder (ESS)
- Sleep Disorder Insomnia (ISI)
- Social Anxiety (LSAS)
- Stress (PSS)

User's answers:
{answers_text}

Consider:
1. Which scale's questions elicited the most concerning responses
2. The severity and frequency of symptoms mentioned
3. The overall pattern of responses

**Response Requirements:**
- Return ONLY a strict JSON object with the following fields:
  {{
    "finalScale": "ScaleName" (must match one of the listed scales exactly),
    "confidence": "X%" (a percentage from 0% to 100%),
    "rationale": "Brief explanation of why this scale was chosen"
  }}
- If you cannot determine a scale (e.g., insufficient data or all responses are neutral), return:
  {{
    "error": "Reason for failure (e.g., insufficient data to determine scale)"
  }}
- Do NOT include any additional text, explanations, or markdown outside the JSON object.
"""

        model = genai.GenerativeModel("gemini-1.5-pro")
        response = model.generate_content(prompt)

        try:
            result = json.loads(response.text.strip())
            print("Parsed API response (direct):", result)
        except json.JSONDecodeError:
            print("Raw API response:", response.text)
            json_match = re.search(r'```json\n(.*?)\n```', response.text, re.DOTALL)
            if json_match:
                result = json.loads(json_match.group(1).strip())
                print("Parsed API response (from Markdown):", result)
            else:
                # Try to find plain JSON
                json_match = re.search(r'\{.*\}', response.text, re.DOTALL)
                if json_match:
                    result = json.loads(json_match.group(0).strip())
                    print("Parsed API response (plain JSON):", result)
                else:
                    raise HTTPException(
                        status_code=500,
                        detail=f"Failed to parse API response: No valid JSON found. Raw response: {response.text}"
                    )

        # Validate the response structure
        if "error" in result:
            raise HTTPException(status_code=500, detail=result["error"])
        if not all(key in result for key in ["finalScale", "confidence", "rationale"]):
            raise ValueError("Missing required fields in response: must include finalScale, confidence, and rationale")
        if not isinstance(result["confidence"], str) or not re.match(r'^\d{1,3}%$', result["confidence"]):
            raise ValueError("Confidence must be a string percentage (e.g., '75%')")
        if result["finalScale"] not in [
            "Anxiety (GAD-7)", "Body Image (BSQ)", "Depression (PHQ 9)", "PTSD (PCL-5)",
            "Alcohol Use (AUDIT)", "Drug Use (DAST-10)", "Grief and Loss (ICG)",
            "Identity Crisis (SCS)", "OCD (OCI-R)", "Self-Esteem (Rosenberg Self-Esteem Scale)",
            "Sleep disorder (ESS)", "Sleep Disorder Insomnia (ISI)", "Social Anxiety (LSAS)", "Stress (PSS)"
        ]:
            raise ValueError(f"Invalid finalScale: {result['finalScale']} not in allowed list")

        return result
    except HTTPException as he:
        raise he
    except Exception as e:
        print("Error in determine_final_scale:", str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(e)}"
        )