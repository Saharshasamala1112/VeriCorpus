from __future__ import annotations

from dataclasses import dataclass


@dataclass
class Country:
    code: str
    name: str
    dial_code: str


COUNTRIES: list[Country] = [
    Country(code="IN", name="India", dial_code="+91"),
    Country(code="US", name="United States", dial_code="+1"),
    Country(code="GB", name="United Kingdom", dial_code="+44"),
    Country(code="CA", name="Canada", dial_code="+1"),
    Country(code="AU", name="Australia", dial_code="+61"),
    Country(code="DE", name="Germany", dial_code="+49"),
    Country(code="FR", name="France", dial_code="+33"),
    Country(code="JP", name="Japan", dial_code="+81"),
    Country(code="CN", name="China", dial_code="+86"),
    Country(code="BR", name="Brazil", dial_code="+55"),
    Country(code="RU", name="Russia", dial_code="+7"),
    Country(code="KR", name="South Korea", dial_code="+82"),
    Country(code="IT", name="Italy", dial_code="+39"),
    Country(code="ES", name="Spain", dial_code="+34"),
    Country(code="MX", name="Mexico", dial_code="+52"),
    Country(code="NG", name="Nigeria", dial_code="+234"),
    Country(code="ZA", name="South Africa", dial_code="+27"),
    Country(code="AE", name="United Arab Emirates", dial_code="+971"),
    Country(code="SA", name="Saudi Arabia", dial_code="+966"),
    Country(code="SG", name="Singapore", dial_code="+65"),
    Country(code="MY", name="Malaysia", dial_code="+60"),
    Country(code="PH", name="Philippines", dial_code="+63"),
    Country(code="TH", name="Thailand", dial_code="+66"),
    Country(code="ID", name="Indonesia", dial_code="+62"),
    Country(code="PK", name="Pakistan", dial_code="+92"),
    Country(code="BD", name="Bangladesh", dial_code="+880"),
    Country(code="LK", name="Sri Lanka", dial_code="+94"),
    Country(code="NP", name="Nepal", dial_code="+977"),
    Country(code="EG", name="Egypt", dial_code="+20"),
    Country(code="KE", name="Kenya", dial_code="+254"),
    Country(code="GH", name="Ghana", dial_code="+233"),
    Country(code="TZ", name="Tanzania", dial_code="+255"),
    Country(code="TR", name="Turkey", dial_code="+90"),
    Country(code="PL", name="Poland", dial_code="+48"),
    Country(code="NL", name="Netherlands", dial_code="+31"),
    Country(code="SE", name="Sweden", dial_code="+46"),
    Country(code="CH", name="Switzerland", dial_code="+41"),
    Country(code="AT", name="Austria", dial_code="+43"),
    Country(code="BE", name="Belgium", dial_code="+32"),
    Country(code="PT", name="Portugal", dial_code="+351"),
    Country(code="GR", name="Greece", dial_code="+30"),
    Country(code="IL", name="Israel", dial_code="+972"),
    Country(code="CL", name="Chile", dial_code="+56"),
    Country(code="AR", name="Argentina", dial_code="+54"),
    Country(code="CO", name="Colombia", dial_code="+57"),
    Country(code="PE", name="Peru", dial_code="+51"),
    Country(code="VN", name="Vietnam", dial_code="+84"),
    Country(code="MM", name="Myanmar", dial_code="+95"),
]


def get_country_by_code(code: str) -> Country | None:
    return next((c for c in COUNTRIES if c.code == code.upper()), None)


def get_country_by_dial_code(dial_code: str) -> Country | None:
    return next((c for c in COUNTRIES if c.dial_code == dial_code), None)


def search_countries(query: str) -> list[Country]:
    lower = query.lower()
    return [
        c
        for c in COUNTRIES
        if c.name.lower().startswith(lower)
        or c.code.lower().startswith(lower)
        or c.dial_code.startswith(query)
    ]