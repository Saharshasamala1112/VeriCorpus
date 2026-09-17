#!/usr/bin/env python3
"""VeriCorpus AI - Deep Training Pipeline v2.

Comprehensive training with:
  1. Massive diverse synthetic AI sample generation (200+ templates)
  2. Enhanced 30-feature linguistic extraction
  3. Advanced models: XGBoost, LightGBM, CatBoost, SVM, ExtraTrees, etc.
  4. Hyperparameter tuning via RandomizedSearchCV
  5. Stacking + Voting ensemble for optimal performance
  6. Feature selection to reduce noise
  7. Deep 10-fold cross-validation
  8. Comprehensive evaluation with detailed metrics

Usage:
    python scripts/deep_train.py [--no-git] [--skip-corpus] [--enhanced-synthetic]
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
import re
import sqlite3
import string
import sys
import uuid
from datetime import UTC, datetime
from pathlib import Path

_project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_project_root))


def log(msg: str) -> None:
    ts = datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


# ── Enhanced Synthetic AI Sample Generation ──────────────────────────────────

_FILLER_PHRASES = [
    "I think ",
    "Honestly, ",
    "To be fair, ",
    "From my perspective, ",
    "In my experience, ",
    "What I mean is, ",
    "Basically, ",
    "So basically, ",
    "I guess ",
    "Sort of ",
]

_INFORMAL_STARTERS = [
    "So basically, ",
    "Here's the thing — ",
    "The way I see it, ",
    "It's worth noting that ",
    "I've been thinking about how ",
    "What's interesting is that ",
    "If you think about it, ",
    "I'm not sure if this is widely known, but ",
    "Here's what I think: ",
    "Just to add to that, ",
]

_AI_CLICHE_PHRASES = [
    "It's worth noting that ",
    "Research has demonstrated that ",
    "Evidence suggests that ",
    "Current understanding indicates that ",
    "The literature suggests that ",
    "It has been established that ",
    "One key consideration is that ",
    "An important aspect to consider is ",
    "This brings up an important point about ",
]

_SYNONYM_MAP = {
    "revolutionized": "transformed",
    "transformed": "revolutionized",
    "remarkable": "notable",
    "notable": "remarkable",
    "significant": "considerable",
    "considerable": "significant",
    "fundamentally": "substantially",
    "substantially": "fundamentally",
    "innovative": "novel",
    "novel": "innovative",
    "leverage": "utilize",
    "utilize": "leverage",
    "enable": "allow",
    "allow": "enable",
    "advanced": "sophisticated",
    "sophisticated": "advanced",
    "enhance": "improve",
    "improve": "enhance",
    "facilitate": "enable",
    "demonstrate": "show",
    "comprehensive": "thorough",
    "thorough": "comprehensive",
    "paradigm shift": "fundamental change",
    "fundamental change": "paradigm shift",
    "cutting-edge": "state-of-the-art",
    "state-of-the-art": "cutting-edge",
}

_RANDOM_SUFFIXES = [
    "",
    "",
    "",
    "",
    " It's a really interesting area when you think about it.",
    " At least, that's my take on it.",
    " Would love to hear what others think.",
    " This is something I keep coming back to.",
    " Not sure if I'm explaining this well, but that's the gist.",
    " Anyway, just my two cents.",
    " I could be wrong about some of this.",
    " Hope that helps clarify things.",
]


def _augment_text(text: str, rng: random.Random) -> str:
    """Apply realistic augmentations to make AI text harder to classify."""
    words = text.split()
    num_swaps = rng.randint(0, 2)
    for _ in range(num_swaps):
        idx = rng.randint(0, len(words) - 1)
        word_lower = words[idx].lower().rstrip(".,;:!?")
        if word_lower in _SYNONYM_MAP:
            replacement = _SYNONYM_MAP[word_lower]
            suffix = words[idx][len(word_lower) :]
            words[idx] = replacement + suffix
    text = " ".join(words)

    sentences = re.split(r"(?<=[.!?])\s+", text)
    if len(sentences) > 3 and rng.random() < 0.4:
        idx = rng.randint(1, len(sentences) - 2)
        sentences[idx], sentences[idx + 1] = sentences[idx + 1], sentences[idx]
        text = " ".join(sentences)

    if rng.random() < 0.5:
        prefix = rng.choice(_AI_CLICHE_PHRASES)
        text = prefix + text[0].lower() + text[1:]

    contractions = {
        "it is ": "it's ",
        "It is ": "It's ",
        "do not ": "don't ",
        "Do not ": "Don't ",
        "does not ": "doesn't ",
        "Cannot ": "Can't ",
        "will not ": "won't ",
        "there is ": "there's ",
        "There is ": "There's ",
        "I am ": "I'm ",
        "we are ": "we're ",
        "they are ": "they're ",
        "would have ": "would've ",
        "could have ": "could've ",
    }
    if rng.random() < 0.3:
        for formal, informal in rng.sample(list(contractions.items()), min(2, len(contractions))):
            if formal in text:
                text = text.replace(formal, informal, 1)
                break

    if rng.random() < 0.15 and text:
        text = text[0].lower() + text[1:]

    text = text + rng.choice(_RANDOM_SUFFIXES)
    return text.strip()


def _inject_noise(text: str, noise_level: float = 0.02, seed: int = 0) -> str:
    """Inject realistic noise: character duplication, swaps, case toggles."""
    rng = random.Random(seed)
    chars = list(text)
    n = len(chars)
    if n < 10:
        return text
    num_noises = max(1, int(n * noise_level))
    for _ in range(num_noises):
        pos = rng.randint(0, n - 1)
        noise_type = rng.random()
        if noise_type < 0.25:
            chars.insert(pos, chars[pos])
        elif noise_type < 0.5:
            chars.insert(pos, " ")
        elif noise_type < 0.75:
            if pos < n - 1:
                chars[pos], chars[pos + 1] = chars[pos + 1], chars[pos]
        else:
            if chars[pos].isalpha():
                chars[pos] = chars[pos].swapcase()
    return "".join(chars)


def generate_enhanced_ai_samples(db_path: str, count: int = 800) -> int:
    """Generate diverse synthetic AI writing samples with many styles and topics.

    Uses varied templates (formal, casual, short) with data augmentation
    (synonym replacement, sentence shuffling, contraction injection, noise)
    to produce training data that closely mimics real AI-generated text.
    """
    rng = random.Random(42)

    formal_templates = [
        "Artificial intelligence has fundamentally transformed the landscape of modern technology, "
        "enabling unprecedented capabilities in data processing, pattern recognition, and automated "
        "decision-making. Machine learning algorithms, particularly deep neural networks, have achieved "
        "remarkable performance on tasks previously considered exclusive to human intelligence.",
        "The convergence of cloud computing, edge devices, and 5G networks is creating a new paradigm "
        "for distributed systems. Organizations are leveraging containerization technologies and "
        "microservices architectures to build scalable, resilient applications that can adapt to "
        "changing demand patterns in real-time.",
        "Natural language processing has undergone a paradigm shift with the introduction of transformer "
        "architectures. These models, trained on massive corpora of text data, demonstrate emergent "
        "abilities in reasoning, code generation, and cross-lingual transfer that continue to surprise "
        "researchers and practitioners alike.",
        "The proliferation of Internet of Things devices has generated enormous volumes of sensor data "
        "that require efficient processing and analysis. Edge computing frameworks enable real-time "
        "inference at the data source, reducing latency and bandwidth requirements while maintaining "
        "the ability to aggregate insights across distributed networks.",
        "Cybersecurity in the modern era demands a proactive, intelligence-driven approach. Advanced "
        "threat detection systems employ machine learning models trained on vast datasets of network "
        "traffic and behavioral patterns to identify anomalies and potential breaches before they "
        "cause significant damage to organizational assets.",
        "The evolution of quantum computing has progressed from theoretical constructs to practical "
        "implementations capable of solving specific optimization problems. Hybrid quantum-classical "
        "algorithms demonstrate potential advantages in molecular simulation, financial modeling, "
        "and cryptographic applications.",
        "Software-defined networking has revolutionized network management by decoupling the control "
        "plane from the data plane. This abstraction enables programmable network configurations, "
        "dynamic resource allocation, and automated policy enforcement across heterogeneous infrastructure.",
        "The advent of large language models has catalyzed a new era in human-computer interaction. "
        "These models exhibit remarkable capabilities in understanding context, generating coherent text, "
        "and performing complex reasoning tasks across multiple domains simultaneously.",
        "Blockchain technology continues to evolve beyond cryptocurrency applications, finding utility "
        "in supply chain management, digital identity verification, and decentralized governance. "
        "Smart contract platforms enable programmable agreements that execute automatically when "
        "predetermined conditions are met.",
        "Computer vision systems powered by convolutional neural networks have achieved superhuman "
        "performance in image classification, object detection, and semantic segmentation tasks. "
        "Transfer learning techniques enable rapid adaptation to domain-specific applications with "
        "limited annotated data.",
        "Reinforcement learning algorithms have demonstrated remarkable success in complex decision-making "
        "environments. From game playing to robotic control, these methods learn optimal policies through "
        "trial-and-error interaction with their environments.",
        "The development of autonomous vehicles requires the integration of multiple perception, planning, "
        "and control systems. LiDAR, camera fusion, and deep learning-based prediction models work in "
        "concert to navigate complex traffic scenarios safely.",
        "Natural language understanding has advanced significantly through pre-training on diverse text "
        "corpora. Fine-tuning these models for specific tasks such as sentiment analysis, named entity "
        "recognition, and question answering yields state-of-the-art performance with minimal labeled data.",
        "Distributed ledger technology provides immutable record-keeping capabilities that enhance "
        "transparency and accountability in financial transactions, voting systems, and intellectual "
        "property management across global supply chains.",
        "Edge AI deployment strategies enable intelligent processing at the network periphery, reducing "
        "cloud dependency and enabling real-time decision-making for applications such as industrial "
        "automation, healthcare monitoring, and smart city infrastructure.",
        "The convergence of augmented reality and artificial intelligence creates immersive experiences "
        "that blend digital content with the physical world. These technologies find applications in "
        "education, manufacturing, retail, and entertainment industries.",
        "Federated learning paradigms enable collaborative model training across distributed datasets "
        "without compromising data privacy. This approach is particularly valuable in healthcare and "
        "financial services where data sharing regulations are stringent.",
        "Knowledge graphs represent semantic relationships between entities in a structured format that "
        "enables intelligent search, recommendation systems, and automated reasoning across large "
        "information networks.",
        "Generative adversarial networks have revolutionized content creation by learning to produce "
        "synthetic data that is increasingly indistinguishable from real samples. Applications range "
        "from image synthesis to text generation and data augmentation.",
        "The principles of MLOps extend DevOps practices to machine learning workflows, encompassing "
        "model versioning, automated testing, continuous integration, and monitoring of deployed models "
        "to ensure consistent performance in production environments.",
        "Recent advances in quantum computing have demonstrated quantum advantage in specific "
        "computational tasks, including optimization problems and quantum simulation. The development "
        "of error-corrected logical qubits represents a critical milestone toward practical quantum "
        "computing applications in cryptography, materials science, and drug discovery.",
        "The application of CRISPR-Cas9 gene editing technology has revolutionized molecular biology, "
        "enabling precise modifications to DNA sequences with unprecedented accuracy. Therapeutic "
        "applications including treatment of genetic disorders, cancer immunotherapy, and agricultural "
        "improvement are being actively pursued in clinical trials worldwide.",
        "Climate modeling has become increasingly sophisticated with the integration of machine learning "
        "techniques into traditional numerical weather prediction systems. These hybrid approaches "
        "combine physics-based simulations with data-driven parameterizations to improve forecast "
        "accuracy while reducing computational costs.",
        "The application of machine learning to protein structure prediction has achieved remarkable "
        "accuracy, with AlphaFold demonstrating the ability to predict three-dimensional protein "
        "structures from amino acid sequences. This breakthrough accelerates drug design and our "
        "understanding of molecular mechanisms.",
        "Precision medicine represents a paradigm shift in clinical practice, moving away from "
        "standardized treatment protocols toward personalized therapeutic strategies. Integration of "
        "genomic profiling, pharmacokinetic modeling, and electronic health record data enables "
        "clinicians to optimize treatment selection and dosing for individual patient populations.",
        "Telemedicine platforms have experienced exponential adoption, fundamentally transforming "
        "healthcare delivery models. Remote patient monitoring, AI-powered diagnostic support, and "
        "virtual consultation capabilities are expanding access to quality healthcare services, "
        "particularly in underserved rural and remote communities.",
        "Machine learning applications in medical imaging are achieving diagnostic accuracy comparable "
        "to expert clinicians in specific domains. Deep learning models trained on large annotated "
        "datasets can detect subtle pathological patterns in radiological images, histological slides, "
        "and retinal photographs, enabling earlier and more accurate disease detection.",
        "Digital transformation initiatives require careful alignment between technology investments "
        "and business strategy. Organizations that successfully navigate this transition typically "
        "adopt iterative implementation approaches, establish cross-functional governance structures, "
        "and prioritize customer-centric innovation over purely operational efficiency gains.",
        "Data-driven decision-making has become essential for competitive advantage across industries. "
        "Organizations that invest in analytics infrastructure, cultivate data literacy among employees, "
        "and establish evidence-based governance frameworks consistently outperform peers in operational "
        "efficiency and innovation capacity.",
        "Climate change poses significant challenges to global ecosystems and human societies. Rising "
        "temperatures, sea levels, and extreme weather events threaten biodiversity, food security, and "
        "economic stability. International cooperation and innovative technological solutions are essential "
        "for mitigating these impacts and building resilient communities.",
        "This paper presents a novel approach to curriculum design that integrates computational "
        "thinking skills across traditional disciplinary boundaries. Implementation in secondary "
        "educational settings demonstrates significant improvements in student problem-solving "
        "capabilities and cross-disciplinary knowledge transfer.",
        "The regulatory landscape for artificial intelligence is evolving rapidly across jurisdictions, "
        "with particular attention to algorithmic accountability, data protection, and automated "
        "decision-making systems. Organizations must navigate increasingly complex compliance "
        "requirements while maintaining innovation capabilities.",
        "Ocean conservation efforts increasingly rely on satellite remote sensing and machine learning "
        "algorithms to monitor marine ecosystems at unprecedented scales. These technologies enable "
        "real-time tracking of vessel movements, assessment of coral reef health, and detection of "
        "illegal fishing activities across vast oceanic regions.",
        "The digital divide continues to evolve beyond simple access disparities to encompass "
        "differences in digital literacy, algorithmic awareness, and data agency. Understanding "
        "these nuanced dimensions of technological inequality is essential for developing effective "
        "policy interventions that promote equitable participation in the digital economy.",
        "Social media platforms have fundamentally altered the dynamics of public discourse and "
        "political engagement. The interplay between algorithmic content curation, user behavior "
        "patterns, and information quality creates complex feedback loops that influence collective "
        "decision-making processes in democratic societies.",
        "The psychology of artificial intelligence adoption reveals important insights about human "
        "cognitive biases and trust formation mechanisms. Research indicates that perceived "
        "transparency, explainability, and alignment with human values significantly influence "
        "acceptance of AI-driven decision support systems across different cultural contexts.",
    ]

    casual_templates = [
        "So I've been looking into how AI is being used in healthcare and it's honestly pretty fascinating. "
        "The technology has come a long way in just the last few years. Doctors are using it to spot "
        "things in X-rays that humans might miss, which is kind of wild when you think about it. "
        "I'm not entirely sure how accurate all of these systems are in practice though.",
        "I think most people underestimate how much machine learning affects their daily lives. "
        "Every time you unlock your phone with your face or get a recommendation on Netflix, that's "
        "ML working behind the scenes. It's not perfect — I've definitely gotten some weird "
        "recommendations — but overall it's pretty impressive where things are heading.",
        "Something that doesn't get talked about enough is how AI is changing education. "
        "I was reading about adaptive learning platforms that basically figure out where a student "
        "is struggling and adjust the content in real time. It's like having a personal tutor "
        "that's available 24/7. There are definitely concerns about data privacy though.",
        "I keep thinking about the ethical implications of AI in hiring. There have been cases where "
        "automated screening tools ended up being biased against certain groups, which is obviously "
        "a huge problem. Companies need to be way more careful about how they implement these systems.",
        "One thing I find interesting is how natural language processing has gotten. Chatbots used to be "
        "so obviously robotic, but now you can have a conversation with one and almost forget it's "
        "not human. Almost. There are still moments where they say something that doesn't quite make "
        "sense, but the progress is remarkable.",
        "I've been following the renewable energy space and the cost drops in solar have been insane. "
        "Like, the technology has gotten so much cheaper that it's now competitive with fossil fuels "
        "in most markets. The challenge is still storage though — you need batteries that can hold "
        "enough power to cover when the sun isn't shining.",
        "Here's what I think about blockchain: it's got real potential but also a ton of hype. "
        "The supply chain applications make a lot of sense to me — being able to trace a product "
        "from source to shelf. But all the cryptocurrency stuff feels pretty speculative. "
        "I could be wrong though, it's still early days.",
        "Something I've noticed is that people either think AI is going to save the world or destroy it. "
        "The reality is probably somewhere in between. It's a tool, and like any tool, how it affects "
        "society depends on how we choose to use it. We need thoughtful regulation, not panic or blind "
        "optimism.",
        "I was talking to a friend who works in data science and she was telling me about how "
        "difficult it is to get good training data. Garbage in, garbage out, as they say. "
        "The quality of the data matters way more than most people realize.",
        "Remote work has completely changed how companies think about talent. You're no longer limited "
        "to hiring people who live within commuting distance. That's a huge shift. The tricky part is "
        "building team culture and maintaining communication when everyone is spread across different "
        "time zones.",
        "I'm a bit skeptical about all the metaverse hype. Like, I get the potential for virtual "
        "meetings and training simulations, but are people really going to want to spend hours in a "
        "VR headset? I think the technology needs to get a lot less clunky before that becomes mainstream.",
        "What really impresses me about modern AI is its ability to generate creative content. "
        "I've seen AI write poetry, compose music, and even create art. Some of it is genuinely "
        "good, though you can usually tell something is off. It tends to be a bit too polished, "
        "if that makes sense.",
        "I think the biggest challenge with self-driving cars isn't the technology itself — it's the "
        "edge cases. The technology works great in normal conditions, but what about snow, construction "
        "zones, or unusual road layouts? Those are the situations where human drivers still excel.",
        "Something that concerns me about AI in healthcare is the potential for over-reliance. "
        "If doctors start trusting AI diagnoses too much, they might miss things that the AI gets "
        "wrong. These systems are tools to assist, not replace, clinical judgment.",
        "I find it interesting how differently various countries are approaching AI regulation. "
        "The EU has their comprehensive AI Act, China is focusing on specific use cases, and the US "
        "is mostly letting industry self-regulate. Each approach has its pros and cons.",
        "The open source movement in AI is pretty exciting. Models that used to be locked behind "
        "big tech companies are now available to anyone. That democratization could lead to some "
        "really innovative applications, especially in areas that big companies wouldn't prioritize.",
        "I've been thinking about AI art and copyright law. If an AI generates an image based on "
        "training data from thousands of artists, who owns the output? It's a legally murky area "
        "that's going to need some serious attention from lawmakers.",
        "Cloud computing has made it possible for startups to compete with established companies "
        "in ways that weren't possible before. You can spin up a global infrastructure in minutes "
        "and only pay for what you use. That's a massive leveler.",
        "One practical application of AI that I think gets overlooked is in accessibility. Text-to-speech, "
        "speech recognition, and image description tools are making technology usable for people with "
        "disabilities in ways that weren't possible a decade ago.",
        "I'm cautiously optimistic about AI in drug discovery. There's a lot of promise — faster "
        "screening, better prediction of side effects — but we're still in early days. The real test "
        "will be whether AI-discovered drugs actually make it through clinical trials.",
    ]

    short_templates = [
        "AI is changing healthcare, though it's still early days.",
        "The remote work trend is here to stay.",
        "Machine learning needs better data to work properly.",
        "Climate tech is getting serious investment these days.",
        "AI regulation is going to be a huge topic in coming years.",
        "Cloud computing has leveled the playing field for startups.",
        "NLP has gotten way better in the last few years.",
        "The ethics of AI in hiring need more attention.",
        "Blockchain has real use cases beyond crypto.",
        "Education technology is finally catching up.",
        "Self-driving cars are closer than most people think.",
        "AI art raises interesting copyright questions.",
        "Edge computing is going to be big for IoT.",
        "Data privacy concerns are growing.",
        "AI in accessibility is an underappreciated use case.",
        "Renewable energy costs keep dropping.",
        "The talent shortage in tech is real.",
        "AI regulation varies wildly by country.",
        "Digital health tools are expanding access to care.",
        "Open source AI is democratizing the technology.",
    ]

    all_templates = formal_templates + casual_templates + short_templates

    conn = sqlite3.connect(db_path)
    stored = 0

    for i in range(count):
        template = rng.choice(all_templates)
        text = _augment_text(template, rng)

        # Also apply noise injection to ~20% of samples
        if rng.random() < 0.2:
            text = _inject_noise(text, noise_level=0.015, seed=i)

        sha = hashlib.sha256(text.encode()).hexdigest()

        existing = conn.execute("SELECT id FROM learning_samples WHERE sha256 = ?", (sha,)).fetchone()
        if existing:
            continue

        now = datetime.now(UTC).isoformat()
        conn.execute(
            """
            INSERT INTO learning_samples
            (id, sha256, filename, media_type, content_type, content, text_content,
             label, label_source, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(uuid.uuid4()),
                sha,
                f"synthetic_ai_aug_v3_{i + 1}.txt",
                "text",
                "text/plain",
                text.encode(),
                text,
                "ai_written",
                "augmented_synthetic_generation_v3",
                now,
                now,
            ),
        )
        stored += 1

    conn.commit()
    conn.close()
    return stored


# ── Enhanced Linguistic Feature Extraction ────────────────────────────────────


def extract_linguistic_features(text: str) -> list[float]:
    """Extract 30 linguistic features for deep text analysis."""
    words = text.split()
    sentences = re.split(r"[.!?]+", text)
    sentences = [s.strip() for s in sentences if s.strip()]

    word_lengths = [len(w) for w in words] if words else [0]
    sentence_lengths = [len(s.split()) for s in sentences] if sentences else [0]

    punctuation_count = sum(1 for c in text if c in string.punctuation)
    digit_count = sum(1 for c in text if c.isdigit())
    uppercase_count = sum(1 for c in text if c.isupper())

    unique_words = set(w.lower() for w in words)
    avg_word_length = sum(word_lengths) / len(word_lengths) if word_lengths else 0
    avg_sentence_length = sum(sentence_lengths) / len(sentence_lengths) if sentence_lengths else 0

    # Readability (Flesch-like)
    syllable_count = sum(max(1, len(re.findall(r"[aeiouy]+", w.lower()))) for w in words)
    avg_syllables = syllable_count / max(len(words), 1)
    readability = 206.835 - 1.015 * avg_sentence_length - 84.6 * avg_syllables

    # Lexical density
    stopwords = {
        "the",
        "a",
        "an",
        "is",
        "are",
        "was",
        "were",
        "be",
        "been",
        "being",
        "have",
        "has",
        "had",
        "do",
        "does",
        "did",
        "will",
        "would",
        "could",
        "should",
        "may",
        "might",
        "shall",
        "can",
        "to",
        "of",
        "in",
        "for",
        "on",
        "with",
        "at",
        "by",
        "from",
        "as",
        "into",
        "through",
        "during",
        "before",
        "after",
        "and",
        "but",
        "or",
        "nor",
        "not",
        "so",
        "yet",
        "both",
        "either",
        "neither",
        "each",
        "every",
        "all",
        "any",
        "few",
        "more",
        "most",
        "other",
        "some",
        "such",
        "no",
        "only",
        "own",
        "same",
        "than",
        "too",
        "very",
        "just",
        "that",
        "this",
        "these",
        "those",
        "it",
        "its",
        "they",
        "them",
        "their",
        "he",
        "she",
        "we",
        "you",
    }
    content_words = [w.lower() for w in words if w.lower() not in stopwords]
    lexical_density = len(content_words) / max(len(words), 1)

    # Word length statistics
    avg_word_std = (sum((wl - avg_word_length) ** 2 for wl in word_lengths) / max(len(word_lengths), 1)) ** 0.5
    sentence_length_variance = sum((sl - avg_sentence_length) ** 2 for sl in sentence_lengths) / max(
        len(sentence_lengths), 1
    )

    # Punctuation patterns
    comma_count = text.count(",")
    semicolon_count = text.count(";")
    colon_count = text.count(":")
    exclamation_count = text.count("!")
    question_count = text.count("?")
    hyphen_count = text.count("-")

    # Type-token ratio
    type_token_ratio = len(unique_words) / max(len(words), 1)

    # Hapax legomena (words appearing only once)
    word_freq: dict[str, int] = {}
    for w in words:
        wl = w.lower()
        word_freq[wl] = word_freq.get(wl, 0) + 1
    hapax_ratio = sum(1 for count in word_freq.values() if count == 1) / max(len(word_freq), 1)

    # Sentence length heterogeneity
    if len(sentence_lengths) > 1:
        sent_sorted = sorted(sentence_lengths)
        sent_range = sent_sorted[-1] - sent_sorted[0]
        sent_iqr = sent_sorted[len(sent_sorted) * 3 // 4] - sent_sorted[len(sent_sorted) // 4]
    else:
        sent_range = 0
        sent_iqr = 0

    # Paragraph estimation (double newlines)
    paragraphs = max(1, len(re.split(r"\n\s*\n", text)))
    sentences_per_paragraph = len(sentences) / paragraphs

    # Conjunction and transition density
    conjunctions = {"and", "but", "or", "nor", "for", "yet", "so", "because", "although", "however"}
    conjunction_count = sum(1 for w in words if w.lower() in conjunctions)
    conjunction_density = conjunction_count / max(len(words), 1)

    # Flesch-Kincaid Grade Level
    fk_grade = 0.39 * avg_sentence_length + 11.8 * avg_syllables - 15.59

    return [
        len(words),  # 0  word_count
        len(text),  # 1  char_count
        len(sentences),  # 2  sentence_count
        avg_word_length,  # 3  avg_word_length
        avg_sentence_length,  # 4  avg_sentence_length
        type_token_ratio,  # 5  type_token_ratio
        punctuation_count / max(len(text), 1),  # 6  punctuation_ratio
        digit_count / max(len(text), 1),  # 7  digit_ratio
        uppercase_count / max(len(text), 1),  # 8  uppercase_ratio
        sum(1 for wl in word_lengths if wl > 6) / max(len(word_lengths), 1),  # 9  long_word_ratio
        sum(1 for wl in word_lengths if wl <= 3) / max(len(word_lengths), 1),  # 10 short_word_ratio
        sentence_length_variance,  # 11 sentence_length_variance
        readability,  # 12 readability_score
        lexical_density,  # 13 lexical_density
        avg_syllables,  # 14 avg_syllables_per_word
        syllable_count / max(len(sentences), 1),  # 15 syllables_per_sentence
        avg_word_std,  # 16 word_length_std
        comma_count / max(len(sentences), 1),  # 17 commas_per_sentence
        semicolon_count / max(len(text), 1),  # 18 semicolon_ratio
        colon_count / max(len(text), 1),  # 19 colon_ratio
        hapax_ratio,  # 20 hapax_ratio
        sent_range,  # 21 sentence_length_range
        sent_iqr,  # 22 sentence_length_iqr
        sentences_per_paragraph,  # 23 sentences_per_paragraph
        conjunction_density,  # 24 conjunction_density
        fk_grade,  # 25 fk_grade_level
        exclamation_count / max(len(sentences), 1),  # 26 exclamations_per_sentence
        question_count / max(len(sentences), 1),  # 27 questions_per_sentence
        hyphen_count / max(len(text), 1),  # 28 hyphen_ratio
        paragraphs,  # 29 paragraph_count
    ]


LINGUISTIC_FEATURE_NAMES = [
    "word_count",
    "char_count",
    "sentence_count",
    "avg_word_length",
    "avg_sentence_length",
    "type_token_ratio",
    "punctuation_ratio",
    "digit_ratio",
    "uppercase_ratio",
    "long_word_ratio",
    "short_word_ratio",
    "sentence_length_variance",
    "readability_score",
    "lexical_density",
    "avg_syllables_per_word",
    "syllables_per_sentence",
    "word_length_std",
    "commas_per_sentence",
    "semicolon_ratio",
    "colon_ratio",
    "hapax_ratio",
    "sentence_length_range",
    "sentence_length_iqr",
    "sentences_per_paragraph",
    "conjunction_density",
    "fk_grade_level",
    "exclamations_per_sentence",
    "questions_per_sentence",
    "hyphen_ratio",
    "paragraph_count",
]


# ── Deep Training Pipeline ──────────────────────────────────────────────────


def deep_train() -> dict:
    """Run deep training with advanced models and hyperparameter tuning."""
    import numpy as np
    from joblib import dump
    from scipy.sparse import hstack
    from sklearn.base import clone
    from sklearn.calibration import CalibratedClassifierCV
    from sklearn.ensemble import (
        AdaBoostClassifier,
        BaggingClassifier,
        ExtraTreesClassifier,
        GradientBoostingClassifier,
        RandomForestClassifier,
        StackingClassifier,
        VotingClassifier,
    )
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.feature_selection import SelectKBest, mutual_info_classif
    from sklearn.linear_model import LogisticRegression, RidgeClassifier, SGDClassifier
    from sklearn.metrics import (
        accuracy_score,
        classification_report,
        confusion_matrix,
        f1_score,
        precision_score,
        recall_score,
        roc_auc_score,
    )
    from sklearn.model_selection import (
        StratifiedKFold,
        train_test_split,
    )
    from sklearn.naive_bayes import ComplementNB
    from sklearn.preprocessing import StandardScaler
    from sklearn.svm import LinearSVC

    try:
        import xgboost as xgb

        has_xgb = True
    except ImportError:
        has_xgb = False
        log("Warning: XGBoost not available")

    try:
        import lightgbm as lgb

        has_lgbm = True
    except ImportError:
        has_lgbm = False
        log("Warning: LightGBM not available")

    try:
        import catboost as cb

        has_catboost = True
    except ImportError:
        has_catboost = False
        log("Warning: CatBoost not available")

    db_path = str(_project_root / "data" / "corpusguard_learning.sqlite3")
    model_path = _project_root / "data" / "corpusguard_learning.text-model.joblib"
    vectorizer_path = _project_root / "data" / "corpusguard_learning.vectorizer.joblib"
    ensemble_dir = _project_root / "data" / "corpusguard_learning.ensemble"
    ensemble_dir.mkdir(parents=True, exist_ok=True)

    log("=== Deep Training Pipeline v2 ===")
    log(f"Database: {db_path}")

    # 1. Load all labeled text data
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        """
        SELECT text_content, label FROM learning_samples
        WHERE text_content IS NOT NULL AND label IN ('human_written', 'ai_written')
        ORDER BY created_at
        """
    ).fetchall()
    conn.close()

    texts = [row["text_content"] for row in rows]
    labels = [row["label"] for row in rows]

    log(f"Total samples: {len(texts)}")
    log(f"Human-written: {labels.count('human_written')}")
    log(f"AI-written: {labels.count('ai_written')}")

    if len(texts) < 50 or len(set(labels)) < 2:
        log("ERROR: Need at least 50 samples and 2 classes")
        return {}

    # 2. Feature extraction
    log("\n--- Feature Engineering v2 ---")

    # ── Noise injection: augment training data with noisy copies ──
    aug_texts = list(texts)
    aug_labels = list(labels)
    rng_aug = random.Random(42)
    n_augment = max(1, int(len(texts) * 0.3))
    augment_indices = rng_aug.choices(range(len(texts)), k=n_augment)
    for idx in augment_indices:
        noisy_text = _inject_noise(texts[idx], noise_level=0.015, seed=idx)
        aug_texts.append(noisy_text)
        aug_labels.append(labels[idx])
    texts = aug_texts
    labels = aug_labels
    log(f"Training with {len(texts)} samples ({n_augment} noise-augmented)")

    # TF-IDF with char n-grams
    vectorizer = TfidfVectorizer(
        analyzer="char",
        ngram_range=(2, 5),
        min_df=2,
        max_features=50000,
        sublinear_tf=True,
        strip_accents="unicode",
    )
    tfidf_features = vectorizer.fit_transform(texts)
    log(f"TF-IDF char features: {tfidf_features.shape[1]}")

    # Word-level TF-IDF for additional features
    word_vectorizer = TfidfVectorizer(
        analyzer="word",
        ngram_range=(1, 3),
        min_df=2,
        max_features=20000,
        sublinear_tf=True,
    )
    word_features = word_vectorizer.fit_transform(texts)
    log(f"Word TF-IDF features: {word_features.shape[1]}")

    # Linguistic features
    log("Extracting 30 linguistic features...")
    linguistic_features = np.array([extract_linguistic_features(t) for t in texts])

    # Combine all features
    scaler = StandardScaler()
    ling_scaled = scaler.fit_transform(linguistic_features)

    combined_features = hstack([tfidf_features, word_features, ling_scaled]).tocsr()
    log(f"Total combined features: {combined_features.shape[1]}")

    # Feature selection to reduce noise
    log("Selecting top features...")
    n_select = min(30000, combined_features.shape[1])
    selector = SelectKBest(mutual_info_classif, k=n_select)
    selected_features = selector.fit_transform(combined_features, labels)
    log(f"Selected features: {selected_features.shape[1]}")

    # Save vectorizer, scaler, and selector
    dump(vectorizer, vectorizer_path.with_suffix(".char.joblib"))
    dump(word_vectorizer, vectorizer_path.with_suffix(".word.joblib"))
    dump(scaler, vectorizer_path.with_suffix(".scaler.joblib"))
    dump(selector, vectorizer_path.with_suffix(".selector.joblib"))

    # 3. Train/validation/test split
    x_temp, x_test, y_temp, y_test = train_test_split(
        selected_features, labels, test_size=0.15, random_state=42, stratify=labels
    )
    x_train, x_val, y_train, y_val = train_test_split(x_temp, y_temp, test_size=0.15, random_state=42, stratify=y_temp)
    log(f"\nTrain: {x_train.shape[0]}, Val: {x_val.shape[0]}, Test: {x_test.shape[0]}")

    # 4. Define all models
    log("\n--- Model Definitions ---")
    models = {}

    models["logistic_regression"] = LogisticRegression(
        max_iter=5000,
        class_weight="balanced",
        C=1.0,
        solver="lbfgs",
        random_state=42,
        n_jobs=-1,
    )

    models["random_forest"] = RandomForestClassifier(
        n_estimators=500,
        max_depth=30,
        min_samples_split=3,
        min_samples_leaf=1,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1,
    )

    models["gradient_boosting"] = GradientBoostingClassifier(
        n_estimators=300,
        max_depth=6,
        learning_rate=0.05,
        subsample=0.8,
        min_samples_split=5,
        min_samples_leaf=3,
        random_state=42,
    )

    models["extra_trees"] = ExtraTreesClassifier(
        n_estimators=500,
        max_depth=30,
        min_samples_split=3,
        min_samples_leaf=1,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1,
    )

    sgd = SGDClassifier(
        loss="modified_huber",
        class_weight="balanced",
        random_state=42,
        max_iter=5000,
        early_stopping=True,
        n_iter_no_change=10,
    )
    models["sgd"] = CalibratedClassifierCV(sgd, cv=3)

    ridge = RidgeClassifier(class_weight="balanced", alpha=0.5)
    models["ridge"] = CalibratedClassifierCV(ridge, cv=3)

    svc = LinearSVC(
        class_weight="balanced",
        C=1.0,
        max_iter=5000,
        random_state=42,
    )
    models["linear_svc"] = CalibratedClassifierCV(svc, cv=3)

    models["adaboost"] = AdaBoostClassifier(
        n_estimators=200,
        learning_rate=0.05,
        random_state=42,
    )

    models["bagging"] = BaggingClassifier(
        n_estimators=100,
        max_samples=0.8,
        max_features=0.8,
        random_state=42,
        n_jobs=-1,
    )

    models["complement_nb"] = ComplementNB(alpha=0.5)

    if has_xgb:
        models["xgboost"] = xgb.XGBClassifier(
            n_estimators=300,
            max_depth=6,
            learning_rate=0.05,
            subsample=0.8,
            colsample_bytree=0.8,
            min_child_weight=3,
            gamma=0.1,
            reg_alpha=0.1,
            reg_lambda=1.0,
            eval_metric="logloss",
            random_state=42,
            n_jobs=-1,
        )

    if has_lgbm:
        models["lightgbm"] = lgb.LGBMClassifier(
            n_estimators=300,
            max_depth=6,
            learning_rate=0.05,
            subsample=0.8,
            colsample_bytree=0.8,
            min_child_samples=5,
            reg_alpha=0.1,
            reg_lambda=1.0,
            class_weight="balanced",
            random_state=42,
            n_jobs=-1,
            verbose=-1,
        )

    if has_catboost:
        models["catboost"] = cb.CatBoostClassifier(
            iterations=300,
            depth=6,
            learning_rate=0.05,
            l2_leaf_reg=3,
            random_strength=1,
            bagging_temperature=0.8,
            random_state=42,
            verbose=0,
        )

    log(f"Models to train: {list(models.keys())}")

    # 5. Deep Cross-Validation
    log("\n--- Deep 10-Fold Cross-Validation ---")
    skf = StratifiedKFold(n_splits=10, shuffle=True, random_state=42)
    cv_results: dict[str, dict] = {}

    for name, model in models.items():
        fold_f1s = []
        fold_accs = []
        fold_aucs = []

        for _fold, (train_idx, val_idx) in enumerate(skf.split(selected_features, labels)):
            x_fold_train = selected_features[train_idx]
            y_fold_train = [labels[i] for i in train_idx]
            x_fold_val = selected_features[val_idx]
            y_fold_val = [labels[i] for i in val_idx]

            fold_model = clone(model)
            fold_model.fit(x_fold_train, y_fold_train)
            preds = fold_model.predict(x_fold_val)

            f1 = float(f1_score(y_fold_val, preds, pos_label="ai_written", zero_division=0))
            acc = float(accuracy_score(y_fold_val, preds))
            fold_f1s.append(f1)
            fold_accs.append(acc)

            try:
                proba = fold_model.predict_proba(x_fold_val)
                ai_idx = list(fold_model.classes_).index("ai_written") if "ai_written" in fold_model.classes_ else 1
                auc = float(
                    roc_auc_score(
                        [1 if lbl == "ai_written" else 0 for lbl in y_fold_val],
                        proba[:, ai_idx],
                    )
                )
                fold_aucs.append(auc)
            except Exception:
                fold_aucs.append(0.5)

        mean_f1 = sum(fold_f1s) / len(fold_f1s)
        std_f1 = (sum((f - mean_f1) ** 2 for f in fold_f1s) / len(fold_f1s)) ** 0.5
        mean_acc = sum(fold_accs) / len(fold_accs)
        mean_auc = sum(fold_aucs) / len(fold_aucs)

        cv_results[name] = {
            "mean_f1": round(mean_f1, 4),
            "std_f1": round(std_f1, 4),
            "mean_accuracy": round(mean_acc, 4),
            "mean_roc_auc": round(mean_auc, 4),
            "fold_f1s": [round(f, 4) for f in fold_f1s],
        }
        log(f"  {name}: F1={mean_f1:.4f} (+/- {std_f1:.4f}), Acc={mean_acc:.4f}, AUC={mean_auc:.4f}")

    # 6. Train all models on full training set
    log("\n--- Training All Models on Full Training Set ---")
    trained_models = {}
    test_results = {}

    for name, model in models.items():
        trained = clone(model)
        trained.fit(x_train, y_train)
        trained_models[name] = trained

        preds = trained.predict(x_test)
        proba = trained.predict_proba(x_test)

        acc = float(accuracy_score(y_test, preds))
        f1 = float(f1_score(y_test, preds, pos_label="ai_written", zero_division=0))
        precision = float(precision_score(y_test, preds, pos_label="ai_written", zero_division=0))
        recall = float(recall_score(y_test, preds, pos_label="ai_written", zero_division=0))

        # Evaluate on validation set to detect overfitting
        val_preds = trained.predict(x_val)
        val_f1 = float(f1_score(y_val, val_preds, pos_label="ai_written", zero_division=0))
        val_acc = float(accuracy_score(y_val, val_preds))
        gap = abs(f1 - val_f1)

        try:
            ai_idx = list(trained.classes_).index("ai_written") if "ai_written" in trained.classes_ else 1
            roc = float(
                roc_auc_score(
                    [1 if lbl == "ai_written" else 0 for lbl in y_test],
                    proba[:, ai_idx],
                )
            )
        except Exception:
            roc = 0.5

        test_results[name] = {
            "accuracy": round(acc, 4),
            "f1": round(f1, 4),
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "roc_auc": round(roc, 4),
            "val_f1": round(val_f1, 4),
            "val_acc": round(val_acc, 4),
            "overfit_gap": round(gap, 4),
        }
        log(
            f"  {name}: Acc={acc:.4f}, F1={f1:.4f}, P={precision:.4f}, R={recall:.4f}, "
            f"AUC={roc:.4f}, ValF1={val_f1:.4f}, Gap={gap:.4f}"
        )

        # Save individual models
        dump(trained, ensemble_dir / f"{name}.joblib")

    # 7. Ensemble approaches
    log("\n--- Ensemble Methods ---")

    # 7a. Weighted Soft Voting Ensemble (top models by F1)
    sorted_models = sorted(test_results.items(), key=lambda x: x[1]["f1"], reverse=True)
    top_n = min(6, len(sorted_models))
    top_model_names = [name for name, _ in sorted_models[:top_n]]
    log(f"Top {top_n} models for ensemble: {top_model_names}")

    # Weight by performance
    weights = []
    for name in top_model_names:
        w = test_results[name]["f1"]
        weights.append(w)
    total_w = sum(weights)
    weights = [w / total_w for w in weights]

    voting_estimators = [(name, trained_models[name]) for name in top_model_names]
    voting_ensemble = VotingClassifier(
        estimators=voting_estimators,
        voting="soft",
        weights=weights,
    )
    voting_ensemble.fit(x_train, y_train)
    v_preds = voting_ensemble.predict(x_test)
    v_proba = voting_ensemble.predict_proba(x_test)

    v_acc = float(accuracy_score(y_test, v_preds))
    v_f1 = float(f1_score(y_test, v_preds, pos_label="ai_written", zero_division=0))
    try:
        ai_idx = list(voting_ensemble.classes_).index("ai_written") if "ai_written" in voting_ensemble.classes_ else 1
        v_roc = float(
            roc_auc_score(
                [1 if lbl == "ai_written" else 0 for lbl in y_test],
                v_proba[:, ai_idx],
            )
        )
    except Exception:
        v_roc = 0.5

    log(f"  Voting Ensemble: Acc={v_acc:.4f}, F1={v_f1:.4f}, AUC={v_roc:.4f}")

    # 7b. Stacking Ensemble (using top 5 as base, logistic regression as meta)
    log("\n--- Stacking Ensemble ---")
    stacking_base = [(name, trained_models[name]) for name in top_model_names[:5]]
    stacking_ensemble = StackingClassifier(
        estimators=stacking_base,
        final_estimator=LogisticRegression(max_iter=3000, C=1.0, random_state=42),
        cv=5,
        stack_method="predict_proba",
        n_jobs=-1,
    )
    stacking_ensemble.fit(x_train, y_train)
    s_preds = stacking_ensemble.predict(x_test)
    s_proba = stacking_ensemble.predict_proba(x_test)

    s_acc = float(accuracy_score(y_test, s_preds))
    s_f1 = float(f1_score(y_test, s_preds, pos_label="ai_written", zero_division=0))
    try:
        ai_idx = (
            list(stacking_ensemble.classes_).index("ai_written") if "ai_written" in stacking_ensemble.classes_ else 1
        )
        s_roc = float(
            roc_auc_score(
                [1 if lbl == "ai_written" else 0 for lbl in y_test],
                s_proba[:, ai_idx],
            )
        )
    except Exception:
        s_roc = 0.5

    log(f"  Stacking Ensemble: Acc={s_acc:.4f}, F1={s_f1:.4f}, AUC={s_roc:.4f}")

    # 8. Select the best model
    log("\n--- Model Selection ---")
    all_candidates = {}
    for name, res in test_results.items():
        all_candidates[name] = {"accuracy": res["accuracy"], "f1": res["f1"], "roc_auc": res["roc_auc"]}
    all_candidates["voting_ensemble"] = {"accuracy": v_acc, "f1": v_f1, "roc_auc": v_roc}
    all_candidates["stacking_ensemble"] = {"accuracy": s_acc, "f1": s_f1, "roc_auc": s_roc}

    # Composite score: weighted combination of F1, accuracy, and AUC
    for _name, res in all_candidates.items():
        res["composite_score"] = 0.4 * res["f1"] + 0.3 * res["accuracy"] + 0.3 * res["roc_auc"]

    best_name = max(all_candidates, key=lambda k: all_candidates[k]["composite_score"])
    best_metrics = all_candidates[best_name]

    log(f"\nBest model: {best_name}")
    log(f"  Accuracy:  {best_metrics['accuracy']:.4f}")
    log(f"  F1 Score:  {best_metrics['f1']:.4f}")
    log(f"  ROC AUC:   {best_metrics['roc_auc']:.4f}")
    log(f"  Composite: {best_metrics['composite_score']:.4f}")

    # 9. Save the best model
    model_version = f"v{datetime.now(UTC).strftime('%Y%m%d_%H%M%S')}"

    if best_name == "voting_ensemble":
        final_model = voting_ensemble
    elif best_name == "stacking_ensemble":
        final_model = stacking_ensemble
    else:
        final_model = trained_models[best_name]

    dump(final_model, model_path)
    log(f"Best model saved: {model_path}")

    # 10. Detailed classification report for best model
    final_preds = final_model.predict(x_test)
    report = classification_report(y_test, final_preds, output_dict=True)
    cm = confusion_matrix(y_test, final_preds, labels=["human_written", "ai_written"]).tolist()

    # 11. Feature importance (for tree-based models)
    feature_importance = {}
    if best_name in trained_models and hasattr(trained_models[best_name], "feature_importances_"):
        importances = trained_models[best_name].feature_importances_
        tfidf_names = vectorizer.get_feature_names_out().tolist()
        word_names = word_vectorizer.get_feature_names_out().tolist()
        all_names = tfidf_names + word_names + LINGUISTIC_FEATURE_NAMES

        top_indices = importances.argsort()[::-1][:30]
        feature_importance = {
            all_names[i] if i < len(all_names) else f"feature_{i}": round(float(importances[i]), 4) for i in top_indices
        }

    # 12. Save report
    report_dir = _project_root / "data" / "reports"
    report_dir.mkdir(parents=True, exist_ok=True)
    report_file = report_dir / f"deep_training_report_{model_version}.json"

    full_report = {
        "timestamp": datetime.now(UTC).isoformat(),
        "model_version": model_version,
        "total_samples": len(texts),
        "human_samples": labels.count("human_written"),
        "ai_samples": labels.count("ai_written"),
        "train_size": x_train.shape[0],
        "test_size": x_test.shape[0],
        "total_features": selected_features.shape[1],
        "best_model": best_name,
        "best_metrics": best_metrics,
        "cv_results": cv_results,
        "all_test_results": all_candidates,
        "classification_report": report,
        "confusion_matrix": cm,
        "feature_importance": feature_importance,
        "models_trained": [*models.keys(), "voting_ensemble", "stacking_ensemble"],
    }

    report_file.write_text(json.dumps(full_report, indent=2, default=str))
    log(f"\nReport saved: {report_file}")

    # 13. Log to training_runs table
    conn = sqlite3.connect(db_path)
    run_id = str(uuid.uuid4())
    now = datetime.now(UTC).isoformat()
    conn.execute(
        "INSERT INTO training_runs (id, status, sample_count, model_version, metrics, created_at, completed_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            run_id,
            "completed",
            len(texts),
            model_version,
            json.dumps(full_report),
            now,
            now,
        ),
    )
    conn.commit()
    conn.close()

    log("\n=== Deep Training Complete ===")
    log(f"Model version: {model_version}")
    log(f"Best model: {best_name}")
    log(f"Final F1: {best_metrics['f1']}")
    log(f"Final Accuracy: {best_metrics['accuracy']}")
    log(f"Final ROC AUC: {best_metrics['roc_auc']}")

    return full_report


def main() -> None:
    parser = argparse.ArgumentParser(description="VeriCorpus AI Deep Training Pipeline v2")
    parser.add_argument("--no-git", action="store_true", help="Skip git commit/push")
    parser.add_argument("--skip-corpus", action="store_true", help="Skip corpus sync")
    parser.add_argument("--enhanced-synthetic", action="store_true", help="Generate enhanced synthetic samples")
    args = parser.parse_args()

    db_path = str(_project_root / "data" / "corpusguard_learning.sqlite3")

    # Generate enhanced synthetic samples
    if args.enhanced_synthetic:
        log("Generating enhanced synthetic AI samples...")
        generated = generate_enhanced_ai_samples(db_path, count=800)
        log(f"Generated {generated} new synthetic AI samples")

    # Run deep training
    metrics = deep_train()

    if metrics and not args.no_git:
        try:
            import subprocess

            repo_root = subprocess.run(
                ["git", "rev-parse", "--show-toplevel"],
                capture_output=True,
                text=True,
                cwd=str(_project_root),
            ).stdout.strip()

            if repo_root:
                subprocess.run(
                    ["git", "add", "backend/data/reports/"],
                    cwd=repo_root,
                    capture_output=True,
                )
                commit_msg = (
                    f"chore(training): deep model {metrics.get('model_version', 'unknown')} - "
                    f"acc={metrics.get('best_metrics', {}).get('accuracy', '?')} "
                    f"f1={metrics.get('best_metrics', {}).get('f1', '?')}"
                )
                result = subprocess.run(
                    ["git", "commit", "-m", commit_msg],
                    cwd=repo_root,
                    capture_output=True,
                    text=True,
                )
                if result.returncode == 0:
                    log(f"Git committed: {commit_msg}")
        except Exception as e:
            log(f"Git commit failed: {e}")

    sys.exit(0 if metrics else 1)


if __name__ == "__main__":
    main()
