"""Transparent local overlap terms used for public listing discovery."""

import re


# Aliases cover commonly written forms; title terms also support roles outside this vocabulary.
SKILLS = {
    "Python": ("python",), "SQL": ("sql",), "PostgreSQL": ("postgresql", "postgres"),
    "Java": ("java",), "JavaScript": ("javascript", "js"), "TypeScript": ("typescript",),
    "C++": ("c++",), "C#": ("c#",), ".NET": (".net", "dotnet"), "Rust": ("rust",),
    "Go": ("golang", "go programming"), "Kotlin": ("kotlin",), "Swift": ("swift",),
    "React": ("react", "react.js", "reactjs"), "Vue": ("vue", "vue.js"), "Angular": ("angular",),
    "Node.js": ("node.js", "nodejs"), "Django": ("django",), "FastAPI": ("fastapi",),
    "Docker": ("docker",), "Kubernetes": ("kubernetes", "k8s"), "AWS": ("aws", "amazon web services"),
    "Azure": ("azure",), "GCP": ("gcp", "google cloud"), "Linux": ("linux",),
    "Terraform": ("terraform",), "CI/CD": ("ci/cd", "continuous integration"), "Git": ("git",),
    "GraphQL": ("graphql",), "REST APIs": ("rest api", "rest apis", "restful"),
    "Data analysis": ("data analysis", "data analytics"), "Machine learning": ("machine learning",),
    "Data visualization": ("data visualization", "data visualisation"), "ETL": ("etl",),
    "Excel": ("excel",), "Power BI": ("power bi",), "Tableau": ("tableau",), "Spark": ("spark",),
    "Financial modeling": ("financial modeling", "financial modelling"), "Forecasting": ("forecasting",),
    "Accounting": ("accounting",), "Bookkeeping": ("bookkeeping",), "GAAP": ("gaap",),
    "Payroll": ("payroll",), "Auditing": ("auditing",), "Risk management": ("risk management",),
    "Figma": ("figma",), "UX research": ("ux research", "user research"), "Prototyping": ("prototyping",),
    "Accessibility": ("wcag", "web accessibility"), "Product design": ("product design",),
    "Product management": ("product management",), "Project management": ("project management",),
    "Copywriting": ("copywriting",), "Technical writing": ("technical writing",),
    "SEO": ("seo", "search engine optimization"), "Salesforce": ("salesforce",), "CRM": ("crm",),
    "Account management": ("account management",), "Customer success": ("customer success",),
    "Recruiting": ("recruiting", "recruitment"), "Instructional design": ("instructional design",),
    "Contract negotiation": ("contract negotiation",), "Procurement": ("procurement",),
}
ALIASES = {alias: name for name, aliases in SKILLS.items() for alias in aliases}
SKILL_PATTERN = re.compile(r"(?<!\w)(?:" + "|".join(re.escape(s) for s in sorted(ALIASES, key=len, reverse=True)) + r")(?!\w)", re.I)
WORDS = re.compile(r"\.?[\w]+(?:[+#]+|\.[\w]+)?", re.UNICODE)
COMMON_TITLE_WORDS = set("""
a an and as at by for from in of on or the to with en de le la et new jobs job
senior sr junior jr staff principal lead leadership director manager associate specialist vice president
level i ii iii iv v intern internship fall winter spring summer contract temporary permanent
full part time remote hybrid onsite role team teams work canada canadian us usa united states
based office city north south east west general multiple locations global all technology technologies
""".split())


def words(text):
    return WORDS.findall(text.casefold())


def skills_in(text):
    return frozenset(ALIASES[match.group().lower()] for match in SKILL_PATTERN.finditer(text))


def title_terms(title):
    return frozenset(token for token in words(title) if len(token) >= 3 and token.isalpha() and token not in COMMON_TITLE_WORDS)
