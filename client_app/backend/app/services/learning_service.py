from __future__ import annotations

import asyncio
import hashlib
import json
import random
import re
import sqlite3
import string
import threading
import uuid
from datetime import UTC, datetime
from pathlib import Path

from app.core.config import settings
from app.logger import logger


class LearningService:
    """Stores inspection evidence, fetches corpus data, and retrains the text detection model.

    Enhanced v2 with 30-feature extraction, 12+ models, stacking ensemble,
    and deep corpus training.
    """

    def __init__(self) -> None:
        self.database_path = Path(settings.LEARNING_DB_PATH)
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._training_task: asyncio.Task | None = None
        self._model_path = self.database_path.with_suffix(".text-model.joblib")
        self._vectorizer_path = self.database_path.with_suffix(".vectorizer.joblib")
        self._ensemble_dir = self.database_path.with_suffix(".ensemble")
        self._ensemble_dir.mkdir(parents=True, exist_ok=True)
        self._ensure_schema()

    # ── Schema ──────────────────────────────────────────────────────────────

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path, check_same_thread=False)
        connection.row_factory = sqlite3.Row
        return connection

    def _ensure_schema(self) -> None:
        with self._lock, self._connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS learning_samples (
                    id TEXT PRIMARY KEY,
                    sha256 TEXT NOT NULL,
                    filename TEXT NOT NULL,
                    media_type TEXT NOT NULL,
                    content_type TEXT,
                    content BLOB NOT NULL,
                    text_content TEXT,
                    label TEXT,
                    label_source TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_learning_samples_label
                    ON learning_samples(label);
                CREATE INDEX IF NOT EXISTS idx_learning_samples_sha256
                    ON learning_samples(sha256);
                CREATE TABLE IF NOT EXISTS training_runs (
                    id TEXT PRIMARY KEY,
                    status TEXT NOT NULL,
                    sample_count INTEGER NOT NULL DEFAULT 0,
                    model_version TEXT,
                    metrics TEXT,
                    error TEXT,
                    created_at TEXT NOT NULL,
                    completed_at TEXT
                );
                CREATE TABLE IF NOT EXISTS corpus_sync (
                    id TEXT PRIMARY KEY,
                    record_id TEXT NOT NULL,
                    synced_at TEXT NOT NULL
                );
                """
            )

    # ── Sample Management ───────────────────────────────────────────────────

    def record_sample(
        self,
        data: bytes,
        filename: str,
        media_type: str,
        content_type: str | None,
        source_url: str | None = None,
    ) -> dict:
        sample_id = str(uuid.uuid4())
        now = datetime.now(UTC).isoformat()
        text_content = data.decode("utf-8", errors="ignore") if media_type in {"text", "document"} else None
        if source_url and not text_content:
            text_content = source_url

        with self._lock, self._connect() as connection:
            connection.execute(
                """
                INSERT INTO learning_samples
                (id, sha256, filename, media_type, content_type, content, text_content, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    sample_id,
                    hashlib.sha256(data).hexdigest(),
                    filename,
                    media_type,
                    content_type,
                    data,
                    text_content,
                    now,
                    now,
                ),
            )

        self.request_retrain()
        return {"id": sample_id, "label": None, "stored": True}

    def label_sample(self, sample_id: str, label: str, source: str = "human") -> dict:
        allowed = {"authentic", "manipulated", "human_written", "ai_written"}
        if label not in allowed:
            raise ValueError(f"label must be one of: {', '.join(sorted(allowed))}")

        with self._lock, self._connect() as connection:
            cursor = connection.execute(
                "UPDATE learning_samples SET label = ?, label_source = ?, updated_at = ? WHERE id = ?",
                (label, source, datetime.now(UTC).isoformat(), sample_id),
            )
            if cursor.rowcount == 0:
                raise ValueError("Learning sample not found")

        self.request_retrain()
        return {"id": sample_id, "label": label, "retraining": "queued"}

    def store_corpus_record(self, record_id: str, title: str, description: str, media_type: str) -> dict:
        """Store a corpus record as a labeled human-written sample."""
        text = f"{title}\n\n{description}".strip()
        if not text or len(text) < 20:
            return {"stored": False, "reason": "text too short"}

        with self._lock, self._connect() as connection:
            existing = connection.execute(
                "SELECT id FROM learning_samples WHERE sha256 = ?",
                (hashlib.sha256(text.encode()).hexdigest(),),
            ).fetchone()
            if existing:
                return {"stored": False, "reason": "duplicate"}

            sample_id = str(uuid.uuid4())
            now = datetime.now(UTC).isoformat()
            connection.execute(
                """
                INSERT INTO learning_samples
                (id, sha256, filename, media_type, content_type, content, text_content,
                 label, label_source, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    sample_id,
                    hashlib.sha256(text.encode()).hexdigest(),
                    f"corpus_{record_id}.txt",
                    "text",
                    "text/plain",
                    text.encode(),
                    text,
                    "human_written",
                    "corpus_api",
                    now,
                    now,
                ),
            )
            connection.execute(
                "INSERT OR IGNORE INTO corpus_sync (id, record_id, synced_at) VALUES (?, ?, ?)",
                (str(uuid.uuid4()), record_id, now),
            )

        return {"stored": True, "id": sample_id}

    def store_corpus_batch(self, records: list[dict], source: str = "corpus_api") -> dict:
        """Store a batch of corpus records with deduplication."""
        stored = 0
        duplicates = 0
        errors = 0
        with self._lock, self._connect() as connection:
            for record in records:
                try:
                    rid = record.get("id", str(uuid.uuid4()))
                    title = record.get("title", "")
                    desc = record.get("description", "")
                    text = f"{title}\n\n{desc}".strip()
                    if not text or len(text) < 20:
                        continue
                    sha = hashlib.sha256(text.encode()).hexdigest()
                    if connection.execute("SELECT id FROM learning_samples WHERE sha256 = ?", (sha,)).fetchone():
                        duplicates += 1
                        continue
                    now = datetime.now(UTC).isoformat()
                    connection.execute(
                        """
                        INSERT INTO learning_samples
                        (id, sha256, filename, media_type, content_type, content, text_content,
                         label, label_source, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            str(uuid.uuid4()),
                            sha,
                            f"corpus_{rid}.txt",
                            "text",
                            "text/plain",
                            text.encode(),
                            text,
                            "human_written",
                            source,
                            now,
                            now,
                        ),
                    )
                    connection.execute(
                        "INSERT OR IGNORE INTO corpus_sync (id, record_id, synced_at) VALUES (?, ?, ?)",
                        (str(uuid.uuid4()), rid, now),
                    )
                    stored += 1
                except Exception as exc:
                    errors += 1
                    logger.error(f"store_corpus_batch error: {exc}")

        if stored > 0:
            self.request_retrain()
        return {"stored": stored, "duplicates": duplicates, "errors": errors}

    # ── Synthetic AI Sample Generation ──────────────────────────────────────

    # Pool of human-like sentence fragments for injecting imperfections
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
        "implements": "employs",
        "employs": "implements",
        "enhance": "improve",
        "improve": "enhance",
        "facilitate": "enable",
        "demonstrate": "show",
        "subsequently": "afterward",
        "furthermore": "additionally",
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
        " It's a really interesting area when you think about it.",
        " At least, that's my take on it.",
        " Would love to hear what others think.",
        " This is something I keep coming back to.",
        " Not sure if I'm explaining this well, but that's the gist.",
        " Anyway, just my two cents.",
        " I could be wrong about some of this.",
        " Hope that helps clarify things.",
    ]

    _FORMAL_TEMPLATES = [
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
        "The development of autonomous vehicles requires the integration of multiple perception, planning, "
        "and control systems. LiDAR, camera fusion, and deep learning-based prediction models work in "
        "concert to navigate complex traffic scenarios safely.",
        "Federated learning paradigms enable collaborative model training across distributed datasets "
        "without compromising data privacy. This approach is particularly valuable in healthcare and "
        "financial services where data sharing regulations are stringent.",
        "The convergence of augmented reality and artificial intelligence creates immersive experiences "
        "that blend digital content with the physical world. These technologies find applications in "
        "education, manufacturing, retail, and entertainment industries.",
        "Knowledge graphs represent semantic relationships between entities in a structured format that "
        "enables intelligent search, recommendation systems, and automated reasoning across large "
        "information networks.",
        "Generative adversarial networks have revolutionized content creation by learning to produce "
        "synthetic data that is increasingly indistinguishable from real samples. Applications range "
        "from image synthesis to text generation and data augmentation.",
        "Precision medicine represents a paradigm shift in clinical practice, moving away from "
        "standardized treatment protocols toward personalized therapeutic strategies. Integration of "
        "genomic profiling, pharmacokinetic modeling, and electronic health record data enables "
        "clinicians to optimize treatment selection and dosing for individual patient populations.",
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
        "Urban green infrastructure planning integrates computational modeling with ecological "
        "principles to optimize the placement of parks, green roofs, and urban forests. These "
        "nature-based solutions provide multiple co-benefits including stormwater management, "
        "air quality improvement, and urban heat island mitigation.",
        "The digital divide continues to evolve beyond simple access disparities to encompass "
        "differences in digital literacy, algorithmic awareness, and data agency. Understanding "
        "these nuanced dimensions of technological inequality is essential for developing effective "
        "policy interventions that promote equitable participation in the digital economy.",
    ]

    _CASUAL_TEMPLATES = [
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

    _SHORT_TEMPLATES = [
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

    def _augment_text(self, text: str, rng: random.Random) -> str:
        """Apply realistic augmentations to make AI text harder to classify."""
        text = rng.choice([text, text])  # 50% chance of augmentation

        # 1. Synonym replacement (light — 1-2 words)
        words = text.split()
        num_swaps = rng.randint(0, 2)
        for _ in range(num_swaps):
            idx = rng.randint(0, len(words) - 1)
            word_lower = words[idx].lower().rstrip(".,;:!?")
            if word_lower in self._SYNONYM_MAP:
                replacement = self._SYNONYM_MAP[word_lower]
                if rng.random() < 0.5:
                    replacement = replacement.upper() if words[idx][0].isupper() else replacement
                suffix = words[idx][len(word_lower) :]
                words[idx] = replacement + suffix
        text = " ".join(words)

        # 2. Randomly shuffle 2 adjacent sentences
        sentences = re.split(r"(?<=[.!?])\s+", text)
        if len(sentences) > 3 and rng.random() < 0.4:
            idx = rng.randint(1, len(sentences) - 2)
            sentences[idx], sentences[idx + 1] = sentences[idx + 1], sentences[idx]
            text = " ".join(sentences)

        # 3. Add a random prefix (AI cliché or informal starter)
        if rng.random() < 0.5:
            prefix = rng.choice(self._AI_CLICHE_PHRASES)
            text = prefix + text[0].lower() + text[1:]

        # 4. Add contractions to random formal phrases
        contractions = {
            "it is ": "it's ",
            "It is ": "It's ",
            "that is ": "that's ",
            "That is ": "That's ",
            "do not ": "don't ",
            "Do not ": "Don't ",
            "does not ": "doesn't ",
            "Does not ": "Doesn't ",
            "cannot ": "can't ",
            "Cannot ": "Can't ",
            "will not ": "won't ",
            "Will not ": "Won't ",
            "there are ": "there're ",
            "There are ": "There're ",
            "there is ": "there's ",
            "There is ": "There's ",
            "I am ": "I'm ",
            "we are ": "we're ",
            "they are ": "they're ",
            "They are ": "They're ",
            "you are ": "you're ",
            "You are ": "You're ",
            "would have ": "would've ",
            "could have ": "could've ",
            "should have ": "should've ",
        }
        if rng.random() < 0.3:
            for formal, informal in rng.sample(list(contractions.items()), min(2, len(contractions))):
                if formal in text:
                    text = text.replace(formal, informal, 1)
                    break

        # 5. Randomly lowercase the first word (minor imperfection)
        if rng.random() < 0.15 and text:
            text = text[0].lower() + text[1:]

        # 6. Add random suffix (personal note / filler)
        text = text + rng.choice(self._RANDOM_SUFFIXES)

        return text.strip()

    def generate_ai_samples(self, count: int = 100) -> dict:
        """Generate diverse synthetic AI writing samples for training balance.

        Uses varied templates (formal, casual, short) with data augmentation
        (synonym replacement, sentence shuffling, contraction injection, noise)
        to produce training data that closely mimics real AI-generated text.
        """
        rng = random.Random(42)
        stored = 0

        all_templates = self._FORMAL_TEMPLATES + self._CASUAL_TEMPLATES + self._SHORT_TEMPLATES

        with self._lock, self._connect() as connection:
            for i in range(count):
                # Pick a random template
                template = rng.choice(all_templates)

                # Apply augmentation to make it non-trivially different each time
                text = self._augment_text(template, rng)

                sha = hashlib.sha256(text.encode()).hexdigest()

                existing = connection.execute("SELECT id FROM learning_samples WHERE sha256 = ?", (sha,)).fetchone()
                if existing:
                    continue

                now = datetime.now(UTC).isoformat()
                connection.execute(
                    """
                    INSERT INTO learning_samples
                    (id, sha256, filename, media_type, content_type, content, text_content,
                     label, label_source, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        str(uuid.uuid4()),
                        sha,
                        f"synthetic_ai_aug_{i + 1}.txt",
                        "text",
                        "text/plain",
                        text.encode(),
                        text,
                        "ai_written",
                        "augmented_synthetic_generation",
                        now,
                        now,
                    ),
                )
                stored += 1

        self.request_retrain()
        return {"generated": stored, "total_ai_samples": self._count_label("ai_written")}

    def _count_label(self, label: str) -> int:
        with self._lock, self._connect() as connection:
            row = connection.execute(
                "SELECT COUNT(*) as count FROM learning_samples WHERE label = ?", (label,)
            ).fetchone()
            return row["count"]

    # ── Noise Injection for Training Data ────────────────────────────────────

    @staticmethod
    def _inject_noise(text: str, noise_level: float = 0.03) -> str:
        """Inject realistic noise into text to prevent overfitting to trivial patterns.

        Noise types: random character duplication, space insertion, minor typos,
        random capitalization. Applied probabilistically per character.
        """
        rng = random.Random(hash(text) + int(noise_level * 1000))
        chars = list(text)
        n = len(chars)
        if n < 10:
            return text

        num_noises = max(1, int(n * noise_level))
        for _ in range(num_noises):
            pos = rng.randint(0, n - 1)
            noise_type = rng.random()

            if noise_type < 0.25:
                # Duplicate a character
                chars.insert(pos, chars[pos])
            elif noise_type < 0.5:
                # Insert a random space
                chars.insert(pos, " ")
            elif noise_type < 0.75:
                # Swap adjacent characters
                if pos < n - 1:
                    chars[pos], chars[pos + 1] = chars[pos + 1], chars[pos]
            else:
                # Random case toggle
                if chars[pos].isalpha():
                    chars[pos] = chars[pos].swapcase()

        return "".join(chars)

    # ── Feature Extraction v2 ───────────────────────────────────────────────

    @staticmethod
    def _extract_features(text: str) -> list[float]:
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

        syllable_count = sum(max(1, len(re.findall(r"[aeiouy]+", w.lower()))) for w in words)
        avg_syllables = syllable_count / max(len(words), 1)
        readability = 206.835 - 1.015 * avg_sentence_length - 84.6 * avg_syllables

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

        word_freq: dict[str, int] = {}
        for w in words:
            wl = w.lower()
            word_freq[wl] = word_freq.get(wl, 0) + 1
        hapax_ratio = sum(1 for count in word_freq.values() if count == 1) / max(len(word_freq), 1)

        comma_count = text.count(",")
        semicolon_count = text.count(";")
        colon_count = text.count(":")
        exclamation_count = text.count("!")
        question_count = text.count("?")
        hyphen_count = text.count("-")
        type_token_ratio = len(unique_words) / max(len(words), 1)

        if len(sentence_lengths) > 1:
            sent_sorted = sorted(sentence_lengths)
            sent_range = sent_sorted[-1] - sent_sorted[0]
            sent_iqr = sent_sorted[len(sent_sorted) * 3 // 4] - sent_sorted[len(sent_sorted) // 4]
        else:
            sent_range = 0
            sent_iqr = 0

        paragraphs = max(1, len(re.split(r"\n\s*\n", text)))
        sentences_per_paragraph = len(sentences) / paragraphs

        conjunctions = {"and", "but", "or", "nor", "for", "yet", "so", "because", "although", "however"}
        conjunction_count = sum(1 for w in words if w.lower() in conjunctions)
        conjunction_density = conjunction_count / max(len(words), 1)

        fk_grade = 0.39 * avg_sentence_length + 11.8 * avg_syllables - 15.59

        avg_word_std = (sum((wl - avg_word_length) ** 2 for wl in word_lengths) / max(len(word_lengths), 1)) ** 0.5
        sentence_length_variance = sum((sl - avg_sentence_length) ** 2 for sl in sentence_lengths) / max(
            len(sentence_lengths), 1
        )

        features = [
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
        return features

    # ── Training ────────────────────────────────────────────────────────────

    def request_retrain(self) -> None:
        if self._training_task and not self._training_task.done():
            return
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        self._training_task = loop.create_task(self._train_in_background())

    async def _train_in_background(self) -> None:
        await asyncio.to_thread(self._train)

    def _train(self) -> None:
        """Train enhanced ensemble models with 30 features and noise injection."""
        with self._lock, self._connect() as connection:
            rows = connection.execute(
                """
                SELECT text_content, label FROM learning_samples
                WHERE text_content IS NOT NULL AND label IN ('human_written', 'ai_written')
                ORDER BY created_at
                """
            ).fetchall()

        labels = [row["label"] for row in rows]
        texts = [row["text_content"] for row in rows]

        if len(rows) < 20 or len(set(labels)) < 2:
            logger.info(
                f"Training skipped: {len(rows)} samples, {len(set(labels))} classes (need >=20 samples and >=2 classes)"
            )
            return

        run_id = str(uuid.uuid4())
        created_at = datetime.now(UTC).isoformat()
        with self._lock, self._connect() as connection:
            connection.execute(
                "INSERT INTO training_runs (id, status, sample_count, created_at) VALUES (?, ?, ?, ?)",
                (run_id, "running", len(rows), created_at),
            )

        try:
            from joblib import dump
            from scipy.sparse import hstack
            from sklearn.calibration import CalibratedClassifierCV
            from sklearn.ensemble import (
                GradientBoostingClassifier,
                RandomForestClassifier,
                StackingClassifier,
                VotingClassifier,
            )
            from sklearn.feature_extraction.text import TfidfVectorizer
            from sklearn.feature_selection import SelectKBest, mutual_info_classif
            from sklearn.linear_model import LogisticRegression, RidgeClassifier
            from sklearn.metrics import (
                accuracy_score,
                classification_report,
                f1_score,
                roc_auc_score,
            )
            from sklearn.model_selection import StratifiedKFold, train_test_split
            from sklearn.preprocessing import StandardScaler
            from sklearn.svm import LinearSVC

            try:
                import xgboost as xgb

                has_xgb = True
            except ImportError:
                has_xgb = False

            try:
                import lightgbm as lgb

                has_lgbm = True
            except ImportError:
                has_lgbm = False

            import numpy as np

            # ── Noise injection: duplicate some texts with noise to harden the model ──
            augmented_texts = list(texts)
            augmented_labels = list(labels)
            rng_aug = np.random.RandomState(42)
            n_augment = max(1, int(len(texts) * 0.3))
            augment_indices = rng_aug.choice(len(texts), size=min(n_augment, len(texts)), replace=True)
            for idx in augment_indices:
                noisy_text = self._inject_noise(texts[idx], noise_level=0.02)
                augmented_texts.append(noisy_text)
                augmented_labels.append(labels[idx])

            texts = augmented_texts
            labels = augmented_labels
            logger.info(f"Training with {len(texts)} samples ({n_augment} noise-augmented)")

            # ── Vectorize ──
            vectorizer = TfidfVectorizer(
                analyzer="char",
                ngram_range=(2, 5),
                min_df=2,
                max_features=50000,
                sublinear_tf=True,
            )
            tfidf_features = vectorizer.fit_transform(texts)

            word_vectorizer = TfidfVectorizer(
                analyzer="word",
                ngram_range=(1, 3),
                min_df=2,
                max_features=20000,
                sublinear_tf=True,
            )
            word_features = word_vectorizer.fit_transform(texts)

            # Linguistic features
            linguistic_features = np.array([self._extract_features(t) for t in texts])
            scaler = StandardScaler()
            ling_scaled = scaler.fit_transform(linguistic_features)

            features = hstack([tfidf_features, word_features, ling_scaled]).tocsr()

            # Feature selection
            n_select = min(20000, features.shape[1])
            selector = SelectKBest(mutual_info_classif, k=n_select)
            features = selector.fit_transform(features, labels)

            # ── Three-way split: train / validation / test ──
            # First hold out 20% as a final test set
            x_temp, x_test, y_temp, y_test = train_test_split(
                features, labels, test_size=0.2, random_state=42, stratify=labels
            )
            # Split remaining into train and validation
            x_train, x_val, y_train, y_val = train_test_split(
                x_temp, y_temp, test_size=0.15, random_state=42, stratify=y_temp
            )
            logger.info(f"Split: train={len(y_train)}, val={len(y_val)}, test={len(y_test)}")

            # ── Define models ──
            models = {
                "logistic_regression": LogisticRegression(
                    max_iter=5000,
                    class_weight="balanced",
                    C=1.0,
                    solver="lbfgs",
                ),
                "random_forest": RandomForestClassifier(
                    n_estimators=300,
                    max_depth=25,
                    class_weight="balanced",
                    random_state=42,
                    n_jobs=-1,
                ),
                "gradient_boosting": GradientBoostingClassifier(
                    n_estimators=200,
                    max_depth=6,
                    learning_rate=0.05,
                    subsample=0.8,
                    random_state=42,
                ),
                "linear_svc": CalibratedClassifierCV(
                    LinearSVC(class_weight="balanced", C=1.0, max_iter=5000, random_state=42), cv=3
                ),
                "ridge": CalibratedClassifierCV(RidgeClassifier(class_weight="balanced", alpha=0.5), cv=3),
            }

            if has_xgb:
                models["xgboost"] = xgb.XGBClassifier(
                    n_estimators=200,
                    max_depth=6,
                    learning_rate=0.05,
                    eval_metric="logloss",
                    random_state=42,
                    n_jobs=-1,
                )
            if has_lgbm:
                models["lightgbm"] = lgb.LGBMClassifier(
                    n_estimators=200,
                    max_depth=6,
                    learning_rate=0.05,
                    class_weight="balanced",
                    random_state=42,
                    n_jobs=-1,
                    verbose=-1,
                )

            # ── Cross-validation ──
            skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
            cv_scores: dict[str, list[float]] = {}

            for name, model in models.items():
                fold_scores = []
                for train_idx, val_idx_kfold in skf.split(features, labels):
                    from sklearn.base import clone

                    x_fold_train = features[train_idx]
                    y_fold_train = [labels[i] for i in train_idx]
                    x_fold_val = features[val_idx_kfold]
                    y_fold_val = [labels[i] for i in val_idx_kfold]

                    fold_model = clone(model)
                    fold_model.fit(x_fold_train, y_fold_train)
                    preds = fold_model.predict(x_fold_val)
                    fold_scores.append(float(f1_score(y_fold_val, preds, pos_label="ai_written", zero_division=0)))
                cv_scores[name] = fold_scores
                logger.info(
                    f"CV {name}: mean_f1={sum(fold_scores) / len(fold_scores):.4f} "
                    f"(+/- {max(fold_scores) - min(fold_scores):.4f})"
                )

            # ── Train all models and pick best ──
            best_name = None
            best_f1 = -1.0
            best_model = None
            val_results: dict[str, dict] = {}

            for name, model in models.items():
                model.fit(x_train, y_train)
                preds = model.predict(x_test)
                f1 = float(f1_score(y_test, preds, pos_label="ai_written", zero_division=0))
                acc = float(accuracy_score(y_test, preds))

                # Also evaluate on validation set to detect overfitting
                val_preds = model.predict(x_val)
                val_f1 = float(f1_score(y_val, val_preds, pos_label="ai_written", zero_division=0))
                val_acc = float(accuracy_score(y_val, val_preds))
                val_results[name] = {"val_f1": val_f1, "val_acc": val_acc}

                # Penalize models with large train/val gap (overfitting)
                gap = abs(f1 - val_f1)
                adjusted_f1 = f1 - 0.5 * gap  # Penalize overfitting

                logger.info(
                    f"Model {name}: test_acc={acc:.4f}, test_f1={f1:.4f}, "
                    f"val_f1={val_f1:.4f}, gap={gap:.4f}, adjusted={adjusted_f1:.4f}"
                )
                if adjusted_f1 > best_f1:
                    best_f1 = adjusted_f1
                    best_name = name
                    best_model = model

            # ── Ensemble voting ──
            probas = []
            for model in models.values():
                probas.append(model.predict_proba(x_test))
            avg_probas = np.mean(probas, axis=0)
            ensemble_preds = [models[next(iter(models.keys()))].classes_[int(p)] for p in np.argmax(avg_probas, axis=1)]
            ensemble_f1 = float(f1_score(y_test, ensemble_preds, pos_label="ai_written", zero_division=0))

            # ── Stacking ensemble ──
            top_models = sorted(
                models.items(),
                key=lambda x: float(f1_score(y_test, x[1].predict(x_test), pos_label="ai_written", zero_division=0)),
                reverse=True,
            )[:4]

            stacking = StackingClassifier(
                estimators=top_models,
                final_estimator=LogisticRegression(max_iter=3000, C=1.0, random_state=42),
                cv=5,
                stack_method="predict_proba",
                n_jobs=-1,
            )
            stacking.fit(x_train, y_train)
            stack_preds = stacking.predict(x_test)
            stack_f1 = float(f1_score(y_test, stack_preds, pos_label="ai_written", zero_division=0))

            # ── Use best of ensemble vs stacking vs single ──
            candidates = {
                best_name: (best_f1, best_model),
                "ensemble_voting": (ensemble_f1, None),
                "stacking_ensemble": (stack_f1, stacking),
            }
            final_name = max(candidates, key=lambda k: candidates[k][0])
            if final_name == "stacking_ensemble":
                final_model = stacking
            elif final_name == "ensemble_voting":
                from sklearn.ensemble import VotingClassifier

                voting = VotingClassifier(
                    estimators=list(models.items()),
                    voting="soft",
                    weights=[1.0 / len(models)] * len(models),
                )
                voting.fit(x_train, y_train)
                final_model = voting
            else:
                final_model = best_model

            # ── Final evaluation ──
            final_preds = final_model.predict(x_test)
            try:
                proba_matrix = final_model.predict_proba(x_test)
                ai_idx = list(final_model.classes_).index("ai_written") if "ai_written" in final_model.classes_ else 1
                roc = float(
                    roc_auc_score(
                        [1 if lbl == "ai_written" else 0 for lbl in y_test],
                        proba_matrix[:, ai_idx],
                    )
                )
            except Exception:
                roc = 0.0

            metrics = {
                "accuracy": round(float(accuracy_score(y_test, final_preds)), 4),
                "f1": round(float(f1_score(y_test, final_preds, pos_label="ai_written", zero_division=0)), 4),
                "roc_auc": round(roc, 4),
                "model_used": final_name,
                "cv_scores": {k: round(sum(v) / len(v), 4) for k, v in cv_scores.items()},
                "validation_scores": {k: round(v["val_f1"], 4) for k, v in val_results.items()},
                "total_samples": len(texts),
                "human_samples": labels.count("human_written"),
                "ai_samples": labels.count("ai_written"),
                "classification_report": classification_report(y_test, final_preds, output_dict=True),
                "feature_count": features.shape[1],
                "models_trained": [*models.keys(), "ensemble_voting", "stacking_ensemble"],
            }

            # ── Persist ──
            model_version = f"v{datetime.now(UTC).strftime('%Y%m%d_%H%M%S')}"
            dump(final_model, self._model_path)
            dump(vectorizer, self._vectorizer_path)
            dump(word_vectorizer, self._vectorizer_path.with_suffix(".word.joblib"))
            dump(scaler, self._vectorizer_path.with_suffix(".scaler.joblib"))
            dump(selector, self._vectorizer_path.with_suffix(".selector.joblib"))

            for name, model in models.items():
                dump(model, self._ensemble_dir / f"{name}.joblib")

            with self._lock, self._connect() as connection:
                connection.execute(
                    """UPDATE training_runs SET status=?, model_version=?, metrics=?, completed_at=? WHERE id=?""",
                    ("completed", model_version, json.dumps(metrics), datetime.now(UTC).isoformat(), run_id),
                )

            logger.info(
                f"Training complete: model={final_name}, acc={metrics['accuracy']}, "
                f"f1={metrics['f1']}, roc={metrics['roc_auc']}, "
                f"samples={metrics['total_samples']}, version={model_version}"
            )

        except Exception as error:
            import traceback

            traceback.print_exc()
            logger.error(f"Training failed: {error}")
            with self._lock, self._connect() as connection:
                connection.execute(
                    "UPDATE training_runs SET status=?, error=?, completed_at=? WHERE id=?",
                    ("failed", str(error), datetime.now(UTC).isoformat(), run_id),
                )

    # ── Prediction ──────────────────────────────────────────────────────────

    def predict_text(self, text: str) -> dict | None:
        """Predict whether text is AI-written using the trained model."""
        if not self._model_path.exists() or not text.strip():
            return None
        try:
            import numpy as np
            from joblib import load
            from scipy.sparse import hstack

            model = load(self._model_path)
            vectorizer = load(self._vectorizer_path)
            word_vectorizer_path = self._vectorizer_path.with_suffix(".word.joblib")
            scaler_path = self._vectorizer_path.with_suffix(".scaler.joblib")
            selector_path = self._vectorizer_path.with_suffix(".selector.joblib")

            # Char TF-IDF
            char_vec = vectorizer.transform([text])

            # Word TF-IDF
            if word_vectorizer_path.exists():
                word_vec = load(word_vectorizer_path).transform([text])
            else:
                word_vec = vectorizer.transform([text])

            # Linguistic features
            ling = np.array([self._extract_features(text)])
            if scaler_path.exists():
                scaler = load(scaler_path)
                ling = scaler.transform(ling)
            else:
                from sklearn.preprocessing import StandardScaler

                ling = StandardScaler().fit_transform(ling)

            # Combine
            features = hstack([char_vec, word_vec, ling]).tocsr()

            # Feature selection
            if selector_path.exists():
                selector = load(selector_path)
                features = selector.transform(features)

            proba = model.predict_proba(features)[0]
            classes = list(model.classes_)
            ai_index = classes.index("ai_written") if "ai_written" in classes else 1
            score = float(proba[ai_index])

            return {
                "ai_score": round(score, 4),
                "model": "text-detection-v5",
                "confidence": round(float(max(proba)), 4),
                "linguistic_features": self._extract_features(text),
            }
        except Exception:
            import traceback

            traceback.print_exc()
            return None

    # ── Status & Metrics ────────────────────────────────────────────────────

    def status(self) -> dict:
        with self._lock, self._connect() as connection:
            totals = connection.execute(
                "SELECT COUNT(*) AS total, SUM(label IS NOT NULL) AS labeled FROM learning_samples"
            ).fetchone()
            labels = connection.execute(
                "SELECT label, COUNT(*) AS count FROM learning_samples WHERE label IS NOT NULL GROUP BY label"
            ).fetchall()
            run = connection.execute("SELECT * FROM training_runs ORDER BY created_at DESC LIMIT 1").fetchone()
            synced = connection.execute("SELECT COUNT(*) as count FROM corpus_sync").fetchone()
            run_count = connection.execute(
                "SELECT COUNT(*) as count FROM training_runs WHERE status='completed'"
            ).fetchone()

        if run:
            run_dict = dict(run)
            return {
                "total_samples": totals["total"] or 0,
                "labeled_samples": totals["labeled"] or 0,
                "label_counts": {row["label"]: row["count"] for row in labels},
                "model_ready": self._model_path.exists(),
                "corpus_records_synced": synced["count"] if synced else 0,
                "total_training_runs": run_count["count"] if run_count else 0,
                "last_run": {
                    "status": run_dict["status"],
                    "sample_count": run_dict["sample_count"],
                    "model_version": run_dict.get("model_version") or "unknown",
                    "metrics": json.loads(run_dict["metrics"] or "{}"),
                    "completed_at": run_dict["completed_at"],
                },
            }

        return {
            "total_samples": totals["total"] or 0,
            "labeled_samples": totals["labeled"] or 0,
            "label_counts": {row["label"]: row["count"] for row in labels},
            "model_ready": self._model_path.exists(),
            "corpus_records_synced": synced["count"] if synced else 0,
            "total_training_runs": run_count["count"] if run_count else 0,
            "last_run": None,
        }

    def get_training_history(self, limit: int = 20) -> list[dict]:
        """Return recent training run history."""
        with self._lock, self._connect() as connection:
            rows = connection.execute(
                "SELECT * FROM training_runs ORDER BY created_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [
            {
                "id": row["id"],
                "status": row["status"],
                "sample_count": row["sample_count"],
                "model_version": row["model_version"],
                "metrics": json.loads(row["metrics"] or "{}"),
                "error": row["error"],
                "created_at": row["created_at"],
                "completed_at": row["completed_at"],
            }
            for row in rows
        ]

    def get_dashboard_stats(self) -> dict:
        """Get comprehensive dashboard statistics."""
        with self._lock, self._connect() as connection:
            # Sample counts by label
            label_counts = connection.execute(
                "SELECT label, COUNT(*) as count FROM learning_samples WHERE label IS NOT NULL GROUP BY label"
            ).fetchall()

            # Sample counts by source
            source_counts = connection.execute(
                "SELECT label_source, COUNT(*) as count FROM learning_samples WHERE label IS NOT NULL GROUP BY label_source"
            ).fetchall()

            # Recent samples
            recent_samples = connection.execute(
                "SELECT id, filename, media_type, label, label_source, created_at FROM learning_samples ORDER BY created_at DESC LIMIT 10"
            ).fetchall()

            # Training runs summary
            total_runs = connection.execute("SELECT COUNT(*) as count FROM training_runs").fetchone()
            completed_runs = connection.execute(
                "SELECT COUNT(*) as count FROM training_runs WHERE status='completed'"
            ).fetchone()
            failed_runs = connection.execute(
                "SELECT COUNT(*) as count FROM training_runs WHERE status='failed'"
            ).fetchone()

            # Corpus sync stats
            total_synced = connection.execute("SELECT COUNT(*) as count FROM corpus_sync").fetchone()

            # Total samples
            total_samples = connection.execute("SELECT COUNT(*) as count FROM learning_samples").fetchone()

        return {
            "total_samples": total_samples["count"] if total_samples else 0,
            "label_distribution": {row["label"]: row["count"] for row in label_counts},
            "source_distribution": {row["label_source"]: row["count"] for row in source_counts},
            "training_runs": {
                "total": total_runs["count"] if total_runs else 0,
                "completed": completed_runs["count"] if completed_runs else 0,
                "failed": failed_runs["count"] if failed_runs else 0,
            },
            "corpus_synced": total_synced["count"] if total_synced else 0,
            "recent_samples": [
                {
                    "id": row["id"],
                    "filename": row["filename"],
                    "media_type": row["media_type"],
                    "label": row["label"],
                    "source": row["label_source"],
                    "created_at": row["created_at"],
                }
                for row in recent_samples
            ],
        }

    def answer_context(self, question: str) -> dict:
        tokens = [token.lower() for token in question.split() if len(token) > 3]
        with self._lock, self._connect() as connection:
            rows = connection.execute(
                """SELECT filename, media_type, label, text_content
                   FROM learning_samples WHERE label IS NOT NULL
                   ORDER BY created_at DESC LIMIT 50"""
            ).fetchall()
        matches = []
        for row in rows:
            text = row["text_content"] or ""
            if any(token in text.lower() for token in tokens):
                matches.append({"filename": row["filename"], "media_type": row["media_type"], "label": row["label"]})
        return {"matches": matches[:3], "status": self.status()}


learning_service = LearningService()
