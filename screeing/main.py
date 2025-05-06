import os
import re
import json
import traceback
from time import perf_counter
from typing import Union, Dict
from dotenv import load_dotenv
from contextlib import asynccontextmanager
from fastapi import FastAPI, Body, status
import google.generativeai as genai
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from faiss_vectorstore import FaissVectorStore
from models import FinalScaleResponse, RecommendScaleResponse
from helpers import create_final_scale_selection_prompt, create_scales_recommendation_prompt, \
    extract_keywords, extract_scale_samples, generate_scale_rationale, determine_weighted_final_scale, \
    strip_condition_name, remove_scale_from_all_semantic_ranked_scales


load_dotenv()


async def startup_event():
    """
    This function is called when the server starts.
    It sets the Google API key and configures the Google Generative AI client.
    """
    os.environ['GOOGLE_API_KEY'] = os.getenv('GOOGLE_API_KEY')
    genai.configure(api_key=os.environ['GOOGLE_API_KEY'])
    

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    This function is called when the server starts.
    It sets the Google API key and configures the Google Generative AI client.
    It also initializes the FaissVectorStore.
    """
    await startup_event()
    app.state.faiss_searcher = FaissVectorStore(
        index_path="faiss_vectorstore_data/faiss_index.bin",
        metadata_path="faiss_vectorstore_data/metadata.csv",
        model_name="all-MiniLM-L6-v2"
    )
    app.state.generation_llm = genai.GenerativeModel("gemini-1.5-pro")
    # Load sample answers
    with open("data/sample_answers.json", "r") as file:
        app.state.sample_answers = json.load(file)
    # Load generic questions
    with open("data/generic_questions.json", "r") as file:
        app.state.generic_questions = json.load(file)
    # Load specific questions
    with open("data/specific_questions.json", "r") as file:
        app.state.specific_questions = json.load(file)
    yield
    # Clean up any resources here
    # For example, close database connections or file handles
    print("Shutting down...")

# uvicorn main:app --port 8001 --reload

app = FastAPI(lifespan=lifespan)
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
    """
    Serve the index.html file
    
    Args:
        None
        
    Returns:
        FileResponse: The index.html file
    """
    return FileResponse('static/index.html')


@app.get("/questions")
async def get_generic_questions():
    """
    Return the generic questions.
    
    Args:
        None
        
    Returns:
        list: A list of generic questions
    """
    return app.state.generic_questions


@app.post("/get-specific-questions/")
async def get_specific_questions(top_scales: dict = Body(...)):
    """
    Return the specific questions for the top 3 scales.
    
    Args:
        top_scales (dict): A dictionary containing the top 3 scales from the initial screening
        
    Returns:
        dict: A dictionary containing the specific questions for the top 3 scales
    """
    try:
        # Validate input
        if not top_scales.get("top_3"):
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={"message": "Missing 'top_3' in request body"}
            ) 
        if not isinstance(top_scales["top_3"], list):
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={"message": "'top_3' should be an array"}
            )
        # Get questions for the top 3 scales with validation
        result = {}
        for scale in top_scales["top_3"]:
            if not isinstance(scale, dict):
                continue
            scale_name = scale.get("scale")
            if scale_name and scale_name in app.state.specific_questions:
                result[scale_name] = app.state.specific_questions[scale_name]
        if not result:
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content={"message": "No questions found for the provided scales"}
            )
        return result
        
    except Exception as e:
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"message": f"Error loading specific questions: {str(e)}"}
        )

@app.post("/recommend-scale/")
async def recommend_scale(user_answers: dict = Body(...)) -> Union[RecommendScaleResponse, Dict[str, str]]:
    """
    Recommend a scale for the user based on their answers to the generic questions.
    
    Args:
        user_answers (dict): A dictionary containing the answers to the generic questions
        
    Returns:
        Union[RecommendScaleResponse, Dict[str, str]]: A response containing the recommended scale
    """
    # Format user answers for the prompt
    answers_text = "\n".join([f"Q: {q}\nA: {a}" for q, a in user_answers.items()])
    answers_list = [a for a in user_answers.values()]
    question_list = [q for q in user_answers.keys()]
    scale_samples = extract_scale_samples(app.state.sample_answers)
    keywords = extract_keywords(app.state.sample_answers)
    prompt = create_scales_recommendation_prompt(answers_text, scale_samples, keywords)
    llm_response_raw = app.state.generation_llm.generate_content(prompt)
    all_semantic_search_results = []
    start = perf_counter()
    for question, answer in zip(question_list, answers_list):
        semantic_search_results = app.state.faiss_searcher.search(
            query=answer,
            filter_meta={"Question": question},
            k=6)
        all_semantic_search_results.append(semantic_search_results)
    end = perf_counter() - start
    print(f"Time taken for semantic search: {end} seconds")
    all_semantically_ranked_scales = [
        [res[3]['Condition'] for res in semantically_ranked_results_per_answer]
        for semantically_ranked_results_per_answer in all_semantic_search_results
    ]
    try:
        # First try to parse as pure JSON
        llm_response_json = json.loads(llm_response_raw.text.strip())
    except json.JSONDecodeError:
        try:
            llm_response_json = json.loads(llm_response_raw.text.replace("```json", "").replace("```", "").strip())
            if "General Counselor" in llm_response_raw.text:
                return {"recommendation": "General Counselor"}
        except json.JSONDecodeError:
            # If not pure JSON, try to extract JSON from markdown
            try:
                # Look for JSON in markdown code blocks
                json_match = re.search(r'```json\n(.*?)\n```', llm_response_raw.text, re.DOTALL)
                if json_match:
                    llm_response_json = json.loads(json_match.group(1).strip())
                # Look for plain JSON without code blocks
                json_match = re.search(r'\{.*\}', llm_response_raw.text, re.DOTALL)
                if json_match:
                    llm_response_json = json.loads(json_match.group(0).strip())
                # Check for General Counselor case
                if "General Counselor" in llm_response_raw.text:
                    return {"recommendation": "General Counselor"}
                # If no JSON found, return the raw response with error
                return {
                    "error": "Could not parse response",
                    "raw_response": llm_response_raw.text,
                    "message": "The API response didn't contain valid JSON. Please check the prompt formatting."
                }
            except Exception as e:
                return {
                    "error": "Parse error",
                    "exception": str(e),
                    "raw_response": llm_response_raw.text
                }
    top_3_scales = []
    for scale_data in llm_response_json["top_3"]:
        scale_name = scale_data["scale"]
        scale_confidence = scale_data["confidence"]
        final_scale = determine_weighted_final_scale(llm_suggested_scale=scale_name,
                                                     all_semantically_ranked_scales=all_semantically_ranked_scales)
        if final_scale == scale_name:
            top_3_scales.append({"scale": scale_name, "confidence": scale_confidence})
        else:
            for semantic_search_results_per_answer in all_semantic_search_results:
                final_scale_confidence = None
                for res in semantic_search_results_per_answer:
                    if res[3]['Condition'] == final_scale:
                        final_scale_confidence = str(round(res[2], 2))+"%"
                        break
                if final_scale_confidence:
                    break
            top_3_scales.append({"scale": final_scale, "confidence": final_scale_confidence})
        all_semantically_ranked_scales = remove_scale_from_all_semantic_ranked_scales(
            scale_name=final_scale,
            all_semantic_ranked_scales=all_semantically_ranked_scales
        )
    return RecommendScaleResponse(top_3=top_3_scales)


@app.post("/determine-final-scale/")
async def determine_final_scale(data: dict = Body(...)) -> FinalScaleResponse:
    """
    Determine the final scale for the user based on the answers to the follow-up questions.
    
    Args:
        data (dict): A dictionary containing the answers to the follow-up questions
        
    Returns:
        FinalScaleResponse: A response containing the final scale for the user
    """
    try:
        # Format the answers for the prompt
        answers_list = []
        answers_text = ""
        for scale, questions in data["answers"].items():
            answers_text += f"\n\n{scale} Questions:"
            for q in questions:
                answers_list.append(q['answer'])
                answers_text += f"\nQ: {q['question']}\nA: {q['answer']}"
        # Create prompt to determine the most appropriate scale
        prompt = create_final_scale_selection_prompt(answers_text=answers_text,
                                                    top_scales=data['topScales'])
        start = perf_counter()
        llm_response_raw = app.state.generation_llm.generate_content(prompt)
        end = perf_counter() - start
        print(f"Time taken for LLM response: {end} seconds")
        all_semantic_search_results = []
        start = perf_counter()
        for answer in answers_list:
            all_semantic_search_results.append(app.state.faiss_searcher.search(
                query=answer,
                filter_meta={"Condition": [scale['scale'] for scale in data['topScales']]},
                k=3))
        end = perf_counter() - start
        print(f"Time taken for semantic search: {end} seconds")
        all_semantically_ranked_scales = [
            [strip_condition_name(res[3]['Condition']) for res in semantic_search_results_per_answer]
            for semantic_search_results_per_answer in all_semantic_search_results
        ]
        try:
            llm_response = json.loads(llm_response_raw.text.strip())
        except json.JSONDecodeError:
            try:
                llm_response = json.loads(llm_response_raw.text.replace("```json", "").replace("```", "").strip())
            except json.JSONDecodeError as e:
                raise e
        llm_suggested_scale = llm_response.get("finalScale")
        final_scale = determine_weighted_final_scale(llm_suggested_scale=llm_suggested_scale,
                                                     all_semantically_ranked_scales=all_semantically_ranked_scales)
        # If the LLM suggested scale is the same as the final scale, return the LLM response
        if llm_suggested_scale == final_scale:
            return FinalScaleResponse(**llm_response)
        else:
            # If the LLM suggested scale is not the same as the final scale,
            # return the final scale (the one from the semantic search), its confidence, and the rationale
            for semantic_search_results_per_answer in all_semantic_search_results:
                for res in semantic_search_results_per_answer:
                    if strip_condition_name(res[3]['Condition']) == final_scale:
                        final_scale = res[3]['Condition']
                        final_scale_confidence = str(round(res[2], 2))+"%"
                        break
            start = perf_counter()
            scale_rationale = generate_scale_rationale(llm=app.state.generation_llm,
                                                       scale_name=final_scale,
                                                       answers_text=answers_text)
            end = perf_counter() - start
            print(f"Time taken for generating scale rationale: {end} seconds")
            return FinalScaleResponse(finalScale=final_scale,
                                      confidence=final_scale_confidence,
                                      rationale=scale_rationale)
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"message": f"Error determining final scale: {str(e)}"}
        )