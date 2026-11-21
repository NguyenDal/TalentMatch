"""High-confidence guardrails for the model's skills and job posting excerpts."""

import re


# Whole labels only: specialized forms such as writing API guides, remote sensing,
# hybrid networking, or processing immigration applications remain scoreable.
ROUTINE_SKILL = re.compile(
    r"(?:(?:strong |excellent |good )?(?:(?:written|verbal|oral)(?: and (?:written|verbal|oral))? )?"
    r"communication(?: skills)?|codebase navigation|navigating (?:an? )?(?:unfamiliar |existing )?codebase|"
    r"(?:ability to )?learn unfamiliar systems|teamwork|collaboration|willingness to learn|"
    r"adaptability|attention to detail|specialized technical knowledge)[.!]?", re.IGNORECASE,
)

ACADEMIC_LEVEL = r"(?:bachelor(?:'s|s)?|master(?:'s|s)?|doctoral|undergraduate|graduate|university)"
JOB_CONDITION = re.compile(
    rf"(?:(?:{ACADEMIC_LEVEL}(?: or {ACADEMIC_LEVEL})? )?(?:degree|university education)"
    r"(?: pursuit| requirement| or equivalent experience| in .+)?|"
    r"(?:university|college|student) (?:enrollment|status)|"
    r"(?:(?:remote|hybrid|on[- ]?site)(?: work| arrangement| schedule| role| attendance)?(?: in .+)?)|"
    r"work (?:location|authorization|eligibility)|visa sponsorship|"
    r"(?:[\w.-]+ )?(?:citizenship|permanent residenc[ey]|permanent resident status)|"
    r"(?:at least )?\d+\+? years? of (?:.+ )?experience)[.!]?", re.IGNORECASE,
)

# Keep line breaks as boundaries for lists and location headers. Include sentence
# punctuation in the returned text and avoid splitting after an initial in "U.S."
STATEMENT_BREAK = re.compile(r"[\r\n]+|(?<!\b[A-Za-z]\.)(?<=[.!?])[^\S\r\n]+")


def source_statement(excerpt, posting):
    """Expand a model-selected excerpt to its original statement, including qualifiers."""
    words = excerpt.strip().split()
    if not words:
        return None
    phrase = r"\s+".join(re.escape(word) for word in words)
    match = re.search(r"(?<!\w)" + phrase + r"(?!\w)", posting, re.IGNORECASE)
    if match is None:
        return None

    start, end = 0, len(posting)
    for boundary in STATEMENT_BREAK.finditer(posting):
        if boundary.end() <= match.start():
            start = boundary.end()
        elif boundary.start() >= match.end():
            end = boundary.start()
            break
    return " ".join(posting[start:end].split()).lstrip("-*• ").strip()
