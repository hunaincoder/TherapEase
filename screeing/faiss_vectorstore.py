import faiss
import torch
import pandas as pd
from typing import Dict, Any, List, Tuple
from sentence_transformers import SentenceTransformer


class FaissVectorStore:
    """
    A class for creating and searching a Faiss index of a dataset.
    """
    def __init__(self, index_path: str, metadata_path: str, model_name: str):
        """
        Initialize the FaissVectorStore.
        
        Args:
            index_path (str): The path to the Faiss index file.
            metadata_path (str): The path to the metadata file.
            model_name (str): The name of the sentence transformer model to use.
        """
        self.faiss_index = faiss.read_index(index_path)
        self.metadata = pd.read_csv(metadata_path)
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model = SentenceTransformer(model_name, device=self.device)
    
    def search(self, query: str, filter_meta: Dict[str, List[str]] = None, k: int = 3
               ) -> List[Tuple[str, float, float, Dict[str, Any]]]:
        """
        Search the Faiss index for the most similar documents to a given query.
        
        Args:
            query (str): The query to search for.
            filter_meta (Dict[str, List[str]]): The metadata to filter the results by.
            k (int): The number of results to return.
        
        Returns:
            List[Tuple[str, float, float, Dict[str, Any]]]: A list of tuples containing the answer, distance, confidence, and metadata for each result.
        """
        with torch.no_grad():
            # Encode query
            query_embedding = self.model.encode([query])
        # Search index
        distances, indices = self.faiss_index.search(query_embedding, k=500)
        # Normalize distances to get confidence scores
        min_dist = distances[0].min()
        max_dist = distances[0].max()
        # Get results
        results = []
        # seen_filter_values = set()
        for i in range(len(indices[0])):
            idx = indices[0][i]
            dist = distances[0][i]
            meta = self.metadata.iloc[idx].to_dict()
            matched_answer = meta.pop('Answer')
            # Confidence calculation
            if max_dist != min_dist:
                confidence = (1 - (dist - min_dist) / (max_dist - min_dist)) * 100
            else:
                confidence = 100
            if filter_meta:
                filter_key = list(filter_meta.keys())[0]
                if (filter_key in meta and meta[filter_key] in filter_meta[filter_key]):
                    results.append((matched_answer, dist, confidence, meta))
            else:
                results.append((matched_answer, dist, confidence, meta))
        # Return top-k
        return sorted(results, key=lambda x: x[1])[:k]
