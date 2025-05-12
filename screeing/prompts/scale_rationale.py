"""
    This prompt is used to generate a rationale for why a scale was chosen.
    It is used to provide a more detailed explanation of why a scale was chosen.
"""
SCALE_RATIONALE_PROMPT = """
Based on the user's detailed answers to follow-up questions for this scale:
{scale_name}

Generate a rationale for why this scale was chosen. Don't make it sound like an assumption by using words like "I think" or "Scale was likely chosen because".

User's answers:
{answers_text}

Consider:
1. The severity and frequency of symptoms mentioned
2. The overall pattern of responses

Output:
[Brief explanation of why this scale was chosen here]
"""