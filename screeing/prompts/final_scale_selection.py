"""
    This prompt is used to select the final scale for the user based on the answers to the follow-up questions.
    It is used to determine which single scale is most appropriate.
"""
FINAL_SCALE_SELECTION_PROMPT = """
Based on the user's detailed answers to follow-up questions for these scales:
{top_scales_str}

Analyze the responses and determine which single scale is most appropriate.

User's answers:
{answers_text}

Consider:
1. Which scale's questions elicited the most concerning responses
2. The severity and frequency of symptoms mentioned
3. The overall pattern of responses

Return your recommendation in strict JSON format:
{{
  "finalScale": "ScaleName",
  "confidence": "X%",
  "rationale": "Brief explanation of why this scale was chosen"
}}
"""