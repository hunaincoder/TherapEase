from pydantic import BaseModel
from typing import List, Dict

class FinalScaleResponse(BaseModel):
    """
    Response for the final scale determination.
    
    Args:
        finalScale (str): The final scale
        confidence (str): The confidence of the final scale
        rationale (str): The rationale for the final scale
    """
    finalScale: str
    confidence: str
    rationale: str


class ScaleData(BaseModel):
    """
    Data for a scale.
    
    Args:
        scale (str): The name of the scale
        confidence (str): The confidence of the scale
    """
    scale: str
    confidence: str


class RecommendScaleResponse(BaseModel):
    """
    Response for the scale recommendation.
    
    Args:
        top_3 (List[ScaleData]): The top 3 scales
    """
    top_3: List[ScaleData]
