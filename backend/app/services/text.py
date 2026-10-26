import re
import unicodedata


_WHITESPACE = re.compile(r"\s+")


def clean_expression(value: str) -> str:
    return _WHITESPACE.sub(" ", unicodedata.normalize("NFKC", value).strip())


def normalize_expression(value: str) -> str:
    return clean_expression(value).casefold()
