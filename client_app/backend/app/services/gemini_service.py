import json

import httpx

from app.core.config import settings
from app.core.constants import GEMINI_MODEL, GEMINI_TEMPERATURE
from app.exceptions import GeminiAPIError
from app.logger import logger


class GeminiService:
    def __init__(self):
        self.api_key = settings.GEMINI_API_KEY
        self.model = GEMINI_MODEL
        self.temperature = GEMINI_TEMPERATURE
        self.groq_api_key = settings.GROQ_API_KEY
        self.groq_model = settings.GROQ_MODEL

    def _parse_json(self, text: str) -> str:
        text = text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        return text

    async def _call_gemini(self, prompt: str, temperature: float | None = None, max_tokens: int = 4096) -> str:
        import google.generativeai as genai

        genai.configure(api_key=self.api_key)
        model = genai.GenerativeModel(self.model)

        response = model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(
                temperature=temperature or self.temperature,
                max_output_tokens=max_tokens,
            ),
        )
        return response.text

    async def _call_groq(self, prompt: str, temperature: float | None = None, max_tokens: int = 4096) -> str:
        if not self.groq_api_key:
            raise GeminiAPIError("No Groq API key configured")

        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.groq_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self.groq_model,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": temperature or self.temperature,
                    "max_tokens": max_tokens,
                },
            )
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"]

    async def _call_ollama(self, prompt: str, temperature: float | None = None, max_tokens: int = 4096) -> str:
        import httpx

        from app.core.config import settings

        async with httpx.AsyncClient(timeout=settings.OLLAMA_TIMEOUT) as client:
            response = await client.post(
                f"{settings.OLLAMA_BASE_URL}/api/generate",
                json={
                    "model": settings.OLLAMA_MODEL,
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "temperature": temperature or self.temperature,
                        "num_predict": max_tokens,
                    },
                },
            )
            response.raise_for_status()
            return response.json()["response"]

    async def _call_llm(self, prompt: str, temperature: float | None = None, max_tokens: int = 4096) -> str:
        errors = []

        if self.groq_api_key:
            try:
                result = await self._call_groq(prompt, temperature, max_tokens)
                logger.info("LLM: Used Groq (primary)")
                return result
            except Exception as e:
                error_msg = str(e)
                if "429" in error_msg or "rate" in error_msg.lower():
                    logger.warning(f"Groq rate limited: {e}")
                else:
                    logger.warning(f"Groq failed: {e}")
                errors.append(f"Groq: {e}")

        try:
            result = await self._call_ollama(prompt, temperature, max_tokens)
            logger.info("LLM: Used Ollama (local fallback)")
            return result
        except Exception as e:
            logger.warning(f"Ollama failed: {e}")
            errors.append(f"Ollama: {e}")

        try:
            result = await self._call_gemini(prompt, temperature, max_tokens)
            logger.info("LLM: Used Gemini (last resort)")
            return result
        except Exception as e:
            error_msg = str(e)
            if "429" in error_msg or "quota" in error_msg.lower() or "rate" in error_msg.lower():
                logger.warning(f"Gemini rate limited: {e}")
            else:
                logger.warning(f"Gemini failed: {e}")
            errors.append(f"Gemini: {e}")

        raise GeminiAPIError(f"All LLM providers failed: {'; '.join(errors)}")

    async def analyze_similarity(self, source_text: str, corpus_excerpts: list[dict]) -> dict:
        try:
            corpus_context = ""
            for i, excerpt in enumerate(corpus_excerpts[:10], 1):
                title = excerpt.get("title", f"Document {i}")
                text = excerpt.get("text", excerpt.get("description", ""))
                corpus_context += f"\n--- Corpus Document {i}: {title} ---\n{text[:2000]}\n"

            prompt = f"""You are an expert plagiarism detection analyst. Analyze the following source document against the provided corpus documents and determine similarity levels.

SOURCE DOCUMENT:
{source_text[:5000]}

CORPUS DOCUMENTS FOR COMPARISON:
{corpus_context}

Provide your analysis as a JSON object with exactly this structure:
{{
  "overall_similarity": <float 0.0 to 1.0>,
  "risk_level": "<low|medium|high|critical>",
  "matches_found": <int>,
  "matched_sources": [
    {{
      "document_title": "<title>",
      "similarity_score": <float 0.0 to 1.0>,
      "summary": "<brief explanation of similarity>",
      "matched_passages": [
        {{
          "source_text": "<passage from corpus>",
          "matched_text": "<corresponding passage from source>",
          "similarity_score": <float 0.0 to 1.0>
        }}
      ]
    }}
  ],
  "ai_analysis": "<detailed paragraph analyzing the plagiarism findings>",
  "recommendations": ["<recommendation 1>", "<recommendation 2>"]
}}

Return ONLY the JSON object, no markdown formatting."""

            response_text = await self._call_llm(prompt)
            return json.loads(self._parse_json(response_text))

        except json.JSONDecodeError as e:
            logger.error(f"LLM returned invalid JSON for similarity analysis: {e}")
            raise GeminiAPIError("Failed to parse AI analysis response")
        except GeminiAPIError:
            raise
        except Exception as e:
            logger.error(f"Similarity analysis error: {e}")
            raise GeminiAPIError(str(e))

    async def analyze_standalone(self, text: str) -> dict:
        try:
            prompt = f"""You are an expert plagiarism and AI-content detection analyst. Analyze the following document text STANDALONE — without comparing to any other documents — to assess:

1. **Plagiarism indicators**: copy-paste artifacts, inconsistent tone/register shifts, abrupt style changes, mismatched vocabulary levels, unnatural sentence transitions, mixed formatting styles
2. **AI-generated content indicators**: repetitive sentence structures, overuse of transition phrases, lack of personal voice, overly polished/formulaic writing, uniform paragraph lengths, absence of typos or natural errors
3. **Originality assessment**: Does this read as human-written original work, or does it show signs of being copied/paraphrased from elsewhere or generated by AI?

SOURCE DOCUMENT:
{text[:8000]}

Provide your analysis as a JSON object with exactly this structure:
{{
  "plagiarism_score": <float 0.0 to 1.0, higher means more likely plagiarized>,
  "ai_generated_score": <float 0.0 to 1.0, higher means more likely AI-generated>,
  "originality_score": <float 0.0 to 1.0, higher means more likely original human work>,
  "suspicious_patterns": [
    "<pattern 1 description>",
    "<pattern 2 description>"
  ],
  "style_analysis": {{
    "vocabulary_level": "<simple|moderate|advanced|mixed>",
    "sentence_complexity": "<simple|moderate|complex|varied>",
    "tone_consistency": "<consistent|mostly_consistent|inconsistent>",
    "writing_quality": "<poor|average|good|excellent>"
  }},
  "ai_analysis": "<detailed paragraph explaining your findings about the document's originality and any plagiarism or AI-generation indicators>",
  "recommendations": ["<recommendation 1>", "<recommendation 2>"]
}}

Return ONLY the JSON object, no markdown formatting."""

            response_text = await self._call_llm(prompt)
            return json.loads(self._parse_json(response_text))

        except json.JSONDecodeError as e:
            logger.error(f"LLM returned invalid JSON for standalone analysis: {e}")
            raise GeminiAPIError("Failed to parse standalone AI analysis response")
        except GeminiAPIError:
            raise
        except Exception as e:
            logger.error(f"Standalone analysis error: {e}")
            raise GeminiAPIError(str(e))

    async def search_web(self, text: str) -> dict:
        try:
            import google.generativeai as genai
            from google.generativeai import protos

            genai.configure(api_key=self.api_key)
            model = genai.GenerativeModel(self.model)

            sentences = text.split(".")
            query = ". ".join(sentences[:3]).strip()
            if len(query) > 500:
                query = query[:500]

            prompt = f"""Search the web for documents, articles, and sources that contain text similar to the following passage. Find any matching or closely related content online.

Search query based on the text:
"{query}"

For each web source found, provide:
1. The title of the page/article
2. The URL
3. A snippet of the matching content
4. How similar it is to the original text (0.0 to 1.0)

Provide your findings as a JSON object with exactly this structure:
{{
  "web_sources": [
    {{
      "title": "<page title>",
      "url": "<page URL>",
      "snippet": "<matching text snippet>",
      "similarity_score": <float 0.0 to 1.0>
    }}
  ],
  "total_sources_found": <int>,
  "analysis": "<brief summary of web search findings>"
}}

Return ONLY the JSON object, no markdown formatting."""

            search_tool = protos.Tool(google_search_retrieval=protos.GoogleSearchRetrieval())

            response = model.generate_content(
                prompt,
                tools=[search_tool],
                generation_config=genai.GenerationConfig(
                    temperature=0.1,
                    max_output_tokens=4096,
                ),
            )

            return json.loads(self._parse_json(response.text))

        except json.JSONDecodeError as e:
            logger.warning(f"Gemini web search returned invalid JSON: {e}")
            return {
                "web_sources": [],
                "total_sources_found": 0,
                "analysis": "Web search failed to return structured results.",
            }
        except Exception as e:
            logger.warning(f"Gemini web search error: {e}")
            return {"web_sources": [], "total_sources_found": 0, "analysis": f"Web search unavailable: {e}"}

    async def extract_key_phrases(self, text: str) -> list[str]:
        try:
            prompt = f"""Extract the 10 most important key phrases from this text that could be used for plagiarism detection. Return as a JSON array of strings.

Text:
{text[:3000]}

Return ONLY a JSON array like ["phrase1", "phrase2", ...], no markdown."""

            response_text = await self._call_llm(prompt, temperature=0.1, max_tokens=512)
            return json.loads(self._parse_json(response_text))

        except Exception as e:
            logger.warning(f"Key phrase extraction failed: {e}")
            return []
