from app.services.text import clean_expression, normalize_expression


def test_expression_normalization() -> None:
    assert clean_expression("  Go\t a   long way  ") == "Go a long way"
    assert normalize_expression("  ＳＩＧＮＩＦＩＣＡＮＴ  ") == "significant"
