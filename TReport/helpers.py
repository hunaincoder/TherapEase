"""
    This module contains helper functions for the main application.
"""
from typing import Dict, List


def parse_diarization_result(response: str) -> List[Dict[str, str]]:
    """
    Parses the diarization result from the response.
    
    Args:
        response: The response from the model.
    
    Returns:
        A list of speaker and text.
    """
    # Parse the model's response
    lines = response.strip().splitlines()
    if lines == ["None"]:
        return []
    result = []
    current_speaker = None
    current_text = None
    for line in lines:
        line = line.strip()
        if line.startswith("Speaker:"):
            current_speaker = line.replace("Speaker:", "").strip()
        elif line.startswith("Text:"):
            current_text = line.replace("Text:", "").strip()
            if current_speaker and current_text:
                result.append({"speaker": current_speaker, "text": current_text})
                current_speaker = None
                current_text = None
    return result


def group_diarization_result_by_speaker(diarization_result: List[Dict[str, str]]
                                        ) -> List[Dict[str, str]]:
    """
    Groups the diarization result by speaker.  The result is a list of dictionaries,
    each containing a speaker and the text they spoke.

    Args:
        diarization_result: The diarization result to group.

    Returns:
        A list of dictionaries, each containing a speaker and the text they spoke.
    """
    diarization_result_by_speaker = []
    current_speaker = None
    current_speaker_text = ""
    for item in diarization_result:
        if item['speaker'] != current_speaker and current_speaker is not None:
            diarization_result_by_speaker.append(
                {"speaker": current_speaker,
                 "text": current_speaker_text})
            current_speaker = item['speaker']
            current_speaker_text = item['text']
        else:
            if current_speaker is None:
                current_speaker = item['speaker']
            current_speaker_text += " " + item['text']
    if current_speaker_text != "" and current_speaker is not None:
        diarization_result_by_speaker.append(
            {"speaker": current_speaker,
             "text": current_speaker_text})
    return diarization_result_by_speaker


def convert_diarization_result_to_string(diarization_result: List[Dict[str, str]]) -> str:
    """
    Converts the diarization result to a string.

    Args:
        diarization_result: The diarization result to convert.

    Returns:
        A string of the diarization result.
    """
    if len(diarization_result) == 0:
        return ""
    else:
        return "\n".join([f"{item['speaker']}: {item['text']}" for item in diarization_result])


