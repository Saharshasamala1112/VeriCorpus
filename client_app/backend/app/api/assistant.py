from fastapi import APIRouter, HTTPException

from app.services.learning_service import learning_service

router = APIRouter(prefix="/assistant", tags=["Assistant"])

MAX_QUESTION_LENGTH = 2000


def _chat_answer(question: str, language: str) -> str:
    query = question.lower()
    if language == "te":
        if "deepfake" in query or "fake" in query:
            return "Deepfake తనిఖీ ప్రస్తుతం ఫైల్ రకం, హాష్, మెటాడేటా మరియు అందుబాటులో ఉన్న ఆధారాలను సేకరిస్తుంది. శిక్షణ పొందిన మోడల్ లేకుండా ఇది నిజమైనది లేదా నకిలీ అని తుది నిర్ణయం ఇవ్వదు."
        if "language" in query or "భాష" in question:
            return "Corpus భాషా కేటలాగ్ అందుబాటులో ఉన్నప్పుడు స్థానిక భాషలను చూపిస్తుంది. ప్రస్తుతం ఇంగ్లీష్, తెలుగు మరియు భారతీయ భాషల కోసం ఎంపికలు ఉన్నాయి."
        return "ఫైల్, టెక్స్ట్ లేదా URL పంపండి. VeriCorpus ఆధారాలు, పరిమితులు మరియు తదుపరి తనిఖీ దశలను చూపిస్తుంది."
    if "deepfake" in query or "fake" in query:
        return "The authenticity workspace collects modality, integrity, and provenance signals. It will not claim real or fake until a validated detector is configured."
    if "language" in query:
        return "The language selector uses the Corpus language catalog when available, with a clearly labeled fallback catalog for public use."
    return "Upload media, paste text, or provide a URL. VeriCorpus will show the evidence it can measure, its limitations, and the next useful step."


@router.post("/public-chat")
async def public_chat(payload: dict):
    question = str(payload.get("question") or "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="Missing question")

    # Validate question length
    if len(question) > MAX_QUESTION_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Question too long. Maximum {MAX_QUESTION_LENGTH} characters allowed.",
        )

    language = str(payload.get("language") or "en").lower()
    if len(language) > 16:
        raise HTTPException(status_code=400, detail="Invalid language code")

    context = learning_service.answer_context(question)
    answer = _chat_answer(question, language)
    if context["matches"]:
        answer += f" Stored labeled evidence includes {len(context['matches'])} related sample(s), which can be used to improve future model runs."
    return {
        "answer": answer,
        "language": language,
        "grounded": True,
        "sources": context["matches"],
        "learning_status": context["status"],
    }
