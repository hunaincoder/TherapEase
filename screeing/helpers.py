from typing import List, Dict, Optional
from collections import Counter
import google.generativeai as genai
from prompts.scale_rationale import SCALE_RATIONALE_PROMPT
from prompts.final_scale_selection import FINAL_SCALE_SELECTION_PROMPT
from prompts.scales_recommendation_prompt import SCALES_RECOMMENDATION_PROMPT


def create_final_scale_selection_prompt(answers_text: str, top_scales: List[Dict[str, str]]) -> str:
    """
    Create a prompt for the final scale selection. 
    This prompt is used to select the final scale for the user based on the answers to the follow-up questions.
    It is used to determine which single scale is most appropriate.
    
    Args:
        answers_text (str): The answers to the follow-up questions
        top_scales (List[Dict[str, str]]): The top 3 scales from the initial screening
        
    Returns:
        str: The prompt for the final scale selection
    """
    top_scales_str = ', '.join([s['scale'] for s in top_scales])
    return FINAL_SCALE_SELECTION_PROMPT.format(answers_text=answers_text, top_scales_str=top_scales_str)


def extract_keywords(data: Dict[str, List[str]]) -> Dict[str, str]:
    """
    Extract keywords from the data. 
    This function is used to extract the keywords from the data for the scales recommendation prompt.
    
    Args:
        data (Dict[str, List[str]]): The data from the data.json file
        
    Returns:
        Dict[str, str]: The keywords for the scales recommendation prompt
    """
    return {
        "depression": data["keywords"]["depression"],
        "anxiety": data["keywords"]["anxiety"],
        "ptsd": data["keywords"]["ptsd"]
    }


def create_scales_recommendation_prompt(answers_text: str, scale_samples: Dict[str, str], keywords: Dict[str, str]) -> str:
    """
    Create a prompt for the scales recommendation.
    This prompt is used to recommend the top 3 scales for the user based on the answers to the initial screening questions.
    It is used to determine which scales are most relevant to the user's answers.
    
    Args:
        answers_text (str): The answers to the initial screening questions
        scale_samples (Dict[str, str]): The samples for the scales
        keywords (Dict[str, str]): The keywords for the scales
        
    Returns:
        str: The prompt for the scales recommendation
    """
    return SCALES_RECOMMENDATION_PROMPT.format(answers_text=answers_text, anxiety_samples=scale_samples["anxiety_samples"],
                                               depression_samples=scale_samples["depression_samples"],
                                               Stress_samples=scale_samples["Stress_samples"],
                                               BodyImage_samples=scale_samples["BodyImage_samples"],
                                               PTSD_samples=scale_samples["PTSD_samples"],
                                               AlcoholUse_samples=scale_samples["AlcoholUse_samples"],
                                               DrugUse_samples=scale_samples["DrugUse_samples"],
                                               GriefandLoss_samples=scale_samples["GriefandLoss_samples"],
                                               IdentityCrisis_samples=scale_samples["IdentityCrisis_samples"],
                                               OCD_samples=scale_samples["OCD_samples"],
                                               SelfEsteem_samples=scale_samples["SelfEsteem_samples"],
                                               SleepdisorderInsomnia_samples=scale_samples["SleepdisorderInsomnia_samples"],
                                               SleepDisorder_samples=scale_samples["SleepDisorder_samples"],
                                               SocialAnxiety_samples=scale_samples["SocialAnxiety_samples"],
                                               depression_keywords=keywords["depression"],
                                               anxiety_keywords=keywords["anxiety"],
                                               ptsd_keywords=keywords["ptsd"])


def extract_anxiety_samples(data: Dict[str, List[str]]) -> str:
    """
    Extract anxiety samples from the data.
    This function is used to extract the anxiety samples from the data for the scales recommendation prompt.
    
    Args:
        data (Dict[str, List[str]]): The data from the data.json file
        
    Returns:
        str: The anxiety samples for the scales recommendation prompt
    """
    anxiety_samples = ""
    for question, answers in data['sample_answers']['anxiety'].items():
        anxiety_samples += f"\nQ: {question}"
        for i, answer in enumerate(answers, start=1):
            anxiety_samples += f"\nSample {i}: {answer}"
    return anxiety_samples


def extract_depression_samples(data: Dict[str, List[str]]) -> str:
    """
    Extract depression samples from the data.
    This function is used to extract the depression samples from the data for the scales recommendation prompt.
    
    Args:
        data (Dict[str, List[str]]): The data from the data.json file
        
    Returns:
        str: The depression samples for the scales recommendation prompt
    """
    depression_samples = ""
    for question, answers in data['sample_answers']['depression'].items():
        depression_samples += f"\nQ: {question}"
        for i, answer in enumerate(answers, start=1):
            depression_samples += f"\nSample {i}: {answer}"
    return depression_samples


def extract_stress_samples(data: Dict[str, List[str]]) -> str:
    """
    Extract stress samples from the data.
    This function is used to extract the stress samples from the data for the scales recommendation prompt.
    
    Args:
        data (Dict[str, List[str]]): The data from the data.json file
        
    Returns:
        str: The stress samples for the scales recommendation prompt
    """
    Stress_samples = ""
    for question, answers in data['sample_answers']['Stress'].items():
        Stress_samples += f"\nQ: {question}"
        for i, answer in enumerate(answers, start=1):
            Stress_samples += f"\nSample {i}: {answer}"
    return Stress_samples


def extract_body_image_samples(data: Dict[str, List[str]]) -> str:
    """
    Extract body image samples from the data.
    This function is used to extract the body image samples from the data for the scales recommendation prompt.
    
    Args:
        data (Dict[str, List[str]]): The data from the data.json file
        
    Returns:
        str: The body image samples for the scales recommendation prompt
    """
    BodyImage_samples = ""
    for question, answers in data['sample_answers']['BodyImage'].items():
        BodyImage_samples += f"\nQ: {question}"
        for i, answer in enumerate(answers, start=1):
            BodyImage_samples += f"\nSample {i}: {answer}"
    return BodyImage_samples


def extract_ptsd_samples(data: Dict[str, List[str]]) -> str:
    """
    Extract PTSD samples from the data.
    This function is used to extract the PTSD samples from the data for the scales recommendation prompt.
    
    Args:
        data (Dict[str, List[str]]): The data from the data.json file
        
    Returns:
        str: The PTSD samples for the scales recommendation prompt
    """
    PTSD_samples = ""
    for question, answers in data['sample_answers']['PTSD'].items():
        PTSD_samples += f"\nQ: {question}"
        for i, answer in enumerate(answers, start=1):
            PTSD_samples += f"\nSample {i}: {answer}"
    return PTSD_samples


def extract_alcohol_use_samples(data: Dict[str, List[str]]) -> str:
    """
    Extract alcohol use samples from the data.
    This function is used to extract the alcohol use samples from the data for the scales recommendation prompt.
    
    Args:
        data (Dict[str, List[str]]): The data from the data.json file
        
    Returns:
        str: The alcohol use samples for the scales recommendation prompt
    """
    AlcoholUse_samples = ""
    for question, answers in data['sample_answers']['AlcoholUse'].items():
        AlcoholUse_samples += f"\nQ: {question}"
        for i, answer in enumerate(answers, start=1):
            AlcoholUse_samples += f"\nSample {i}: {answer}"
    return AlcoholUse_samples


def extract_drug_use_samples(data: Dict[str, List[str]]) -> str:
    """
    Extract drug use samples from the data.
    This function is used to extract the drug use samples from the data for the scales recommendation prompt.
    
    Args:
        data (Dict[str, List[str]]): The data from the data.json file
        
    Returns:
        str: The drug use samples for the scales recommendation prompt
    """
    DrugUse_samples = ""
    for question, answers in data['sample_answers']['DrugUse'].items():
        DrugUse_samples += f"\nQ: {question}"
        for i, answer in enumerate(answers, start=1):
            DrugUse_samples += f"\nSample {i}: {answer}"
    return DrugUse_samples


def extract_grief_and_loss_samples(data: Dict[str, List[str]]) -> str:
    """
    Extract grief and loss samples from the data.
    This function is used to extract the grief and loss samples from the data for the scales recommendation prompt.
    
    Args:
        data (Dict[str, List[str]]): The data from the data.json file
        
    Returns:
        str: The grief and loss samples for the scales recommendation prompt
    """
    GriefandLoss_samples = ""
    for question, answers in data['sample_answers']['GriefandLoss'].items():
        GriefandLoss_samples += f"\nQ: {question}"
        for i, answer in enumerate(answers, start=1):
            GriefandLoss_samples += f"\nSample {i}: {answer}"
    return GriefandLoss_samples


def extract_identity_crisis_samples(data: Dict[str, List[str]]) -> str:
    """
    Extract identity crisis samples from the data.
    This function is used to extract the identity crisis samples from the data for the scales recommendation prompt.
    
    Args:
        data (Dict[str, List[str]]): The data from the data.json file
        
    Returns:
        str: The identity crisis samples for the scales recommendation prompt
    """
    IdentityCrisis_samples = ""
    for question, answers in data['sample_answers']['IdentityCrisis'].items():
        IdentityCrisis_samples += f"\nQ: {question}"
        for i, answer in enumerate(answers, start=1):
            IdentityCrisis_samples += f"\nSample {i}: {answer}"
    return IdentityCrisis_samples


def extract_ocd_samples(data: Dict[str, List[str]]) -> str:
    """
    Extract OCD samples from the data.
    This function is used to extract the OCD samples from the data for the scales recommendation prompt.
    
    Args:
        data (Dict[str, List[str]]): The data from the data.json file
        
    Returns:
        str: The OCD samples for the scales recommendation prompt
    """
    OCD_samples = ""
    for question, answers in data['sample_answers']['OCD'].items():
        OCD_samples += f"\nQ: {question}"
        for i, answer in enumerate(answers, start=1):
            OCD_samples += f"\nSample {i}: {answer}"
    return OCD_samples


def extract_self_esteem_samples(data: Dict[str, List[str]]) -> str:
    """
    Extract self esteem samples from the data.
    This function is used to extract the self esteem samples from the data for the scales recommendation prompt.
    
    Args:
        data (Dict[str, List[str]]): The data from the data.json file
        
    Returns:
        str: The self esteem samples for the scales recommendation prompt
    """
    SelfEsteem_samples = ""
    for question, answers in data['sample_answers']['SelfEsteem'].items():
        SelfEsteem_samples += f"\nQ: {question}"
        for i, answer in enumerate(answers, start=1):
            SelfEsteem_samples += f"\nSample {i}: {answer}"
    return SelfEsteem_samples


def extract_sleep_disorder_insomnia_samples(data: Dict[str, List[str]]) -> str:
    """
    Extract sleep disorder insomnia samples from the data.
    This function is used to extract the sleep disorder insomnia samples from the data for the scales recommendation prompt.
    
    Args:
        data (Dict[str, List[str]]): The data from the data.json file
        
    Returns:
        str: The sleep disorder insomnia samples for the scales recommendation prompt
    """
    SleepdisorderInsomnia_samples = ""
    for question, answers in data['sample_answers']['SleepdisorderInsomnia'].items():
        SleepdisorderInsomnia_samples += f"\nQ: {question}"
        for i, answer in enumerate(answers, start=1):
            SleepdisorderInsomnia_samples += f"\nSample {i}: {answer}"
    return SleepdisorderInsomnia_samples


def extract_sleep_disorder_samples(data: Dict[str, List[str]]) -> str:
    """
    Extract sleep disorder samples from the data.
    This function is used to extract the sleep disorder samples from the data for the scales recommendation prompt.
    
    Args:
        data (Dict[str, List[str]]): The data from the data.json file
        
    Returns:
        str: The sleep disorder samples for the scales recommendation prompt
    """
    SleepDisorder_samples = ""
    for question, answers in data['sample_answers']['SleepDisorder'].items():
        SleepDisorder_samples += f"\nQ: {question}"
        for i, answer in enumerate(answers, start=1):
            SleepDisorder_samples += f"\nSample {i}: {answer}"
    return SleepDisorder_samples


def extract_social_anxiety_samples(data: Dict[str, List[str]]) -> str:
    """
    Extract social anxiety samples from the data.
    This function is used to extract the social anxiety samples from the data for the scales recommendation prompt.
    
    Args:
        data (Dict[str, List[str]]): The data from the data.json file
        
    Returns:
        str: The social anxiety samples for the scales recommendation prompt
    """
    SocialAnxiety_samples = ""
    for question, answers in data['sample_answers']['SocialAnxiety'].items():
        SocialAnxiety_samples += f"\nQ: {question}"
        for i, answer in enumerate(answers, start=1):
            SocialAnxiety_samples += f"\nSample {i}: {answer}"
    return SocialAnxiety_samples


def extract_scale_samples(data: Dict[str, List[str]]) -> Dict[str, str]:
    """
    Extract scale samples from the data.
    This function is used to extract the scale samples from the data for the scales recommendation prompt.
    
    Args:
        data (Dict[str, List[str]]): The data from the data.json file
        
    Returns:
        Dict[str, str]: The scale samples for the scales recommendation prompt
    """
    return {
        "anxiety_samples": extract_anxiety_samples(data),
        "depression_samples": extract_depression_samples(data),
        "PTSD_samples": extract_ptsd_samples(data),
        "Stress_samples": extract_stress_samples(data),
        "BodyImage_samples": extract_body_image_samples(data),
        "PTSD_samples": extract_ptsd_samples(data),
        "AlcoholUse_samples": extract_alcohol_use_samples(data),
        "DrugUse_samples": extract_drug_use_samples(data),
        "GriefandLoss_samples": extract_grief_and_loss_samples(data),
        "IdentityCrisis_samples": extract_identity_crisis_samples(data),
        "OCD_samples": extract_ocd_samples(data),
        "SelfEsteem_samples": extract_self_esteem_samples(data),
        "SleepdisorderInsomnia_samples": extract_sleep_disorder_insomnia_samples(data),
        "SleepDisorder_samples": extract_sleep_disorder_samples(data),
        "SocialAnxiety_samples": extract_social_anxiety_samples(data)
    }


def create_scale_rationale_prompt(scale_name: str, answers_text: str) -> str:
    """
    Create a prompt for the scale rationale.
    This prompt is used to generate a rationale for why a scale was chosen.
    
    Args:
        scale_name (str): The name of the scale
        answers_text (str): The answers to the follow-up questions
        
    Returns:
        str: The prompt for the scale rationale
    """
    return SCALE_RATIONALE_PROMPT.format(scale_name=scale_name, answers_text=answers_text)


def generate_scale_rationale(llm: genai.GenerativeModel, scale_name: str, answers_text: str) -> str:
    """
    Generate a rationale for why a scale was chosen.
    This function is used to generate a rationale for why a scale was chosen.
    
    Args:
        llm (genai.GenerativeModel): The LLM to use
        scale_name (str): The name of the scale
        answers_text (str): The answers to the follow-up questions
        
    Returns:
        str: The rationale for why a scale was chosen
    """
    scale_rationale_prompt = create_scale_rationale_prompt(scale_name, answers_text)
    return llm.generate_content(scale_rationale_prompt).text.strip('\n ')


def determine_weighted_final_scale(llm_suggested_scale: str, all_semantically_ranked_scales: List[List[str]]) -> str:
    """
    Determines the final scale based on weighted scores from LLM prediction and semantic ranking.

    Args:
        llm_suggested_scale: The scale suggested by the LLM.
        all_semantically_ranked_scales: A list of scales ranked by semantic similarity.

    Returns:
        The name of the final selected scale.
    """
    weights = Counter()
    # Give high weight to LLM prediction
    if llm_suggested_scale:
        weights[llm_suggested_scale] += 2.0  # weight for LLM's choice
    # Lower weights for semantic search ranking
    for semantic_ranked_scales_per_answer in all_semantically_ranked_scales:
        for rank, scale in enumerate(semantic_ranked_scales_per_answer):
            weights[scale] += 1.0 / (rank + 1)  # higher rank → higher score
    # Pick the skill with highest combined score
    final_scale = weights.most_common(1)[0][0]
    return final_scale


def strip_condition_name(condition_name: str) -> str:
    """
    Strip the condition name from the condition name.
    """
    return condition_name.split('(')[-1].strip(')')


def remove_scale_from_all_semantic_ranked_scales(scale_name: str,
                                                 all_semantic_ranked_scales: List[List[str]]
                                                 ) -> List[List[str]]:
    """
    Remove the scale from the all semantic ranked scales. 
    This function is used to remove the scale from the all semantic ranked scales.
    
    Args:
        scale_name (str): The name of the scale to remove
        all_semantic_ranked_scales (List[List[str]]): The all semantic ranked scales
        
    Returns:
        List[List[str]]: The all semantic ranked scales with the scale removed
    """
    return [
        [res for res in sublist if res != scale_name]
        for sublist in all_semantic_ranked_scales
    ]