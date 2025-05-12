"""
    This prompt is used to recommend the top 3 scales for the user based on the answers to the initial screening questions.
    It is used to determine which scales are most relevant to the user's answers.
"""
SCALES_RECOMMENDATION_PROMPT = """
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
- Depression: {depression_keywords}
- Anxiety: {anxiety_keywords}
- PTSD: {ptsd_keywords}

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